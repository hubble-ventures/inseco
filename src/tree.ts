import { z } from "zod";

// A folder name (a top-level `tree` key or the literal path of a folder). Same
// character set as v1 `paths`: lowercase, digits, `_ - /`.
const folderNamePattern = /^[a-z0-9_/-]+$/;

// A subfolder entry key: a `/`-prefixed segment (e.g. `/sub`, `/vendor/app`).
// The leading slash distinguishes a subfolder from an alias source — env var
// names never start with `/`.
const subfolderPattern = /^\/[a-z0-9_/-]+$/;

const envVarNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const envVarNameSchema = z
  .string()
  .regex(envVarNamePattern, "must be a valid env var name");

// An alias value: the extra env var name(s) a build/runtime expects. One target,
// or several.
const aliasTargetsSchema = z.union([
  envVarNameSchema,
  z.array(envVarNameSchema).min(1),
]);

/** One alias target name, or several. */
export type AliasSpec = string | string[];

/**
 * One entry in a folder's contents array. Either:
 * - a **string** — a plain key emitted as-is, or
 * - an **object** whose entries are, per key:
 *   - `SOURCE: target | [targets]` — an alias (the canonical vault key `SOURCE`
 *     is emitted and copied to each target), or
 *   - `"/sub": [ ... ]` — a subfolder (its own contents array).
 */
export type FolderEntry = string | { [key: string]: AliasSpec | FolderArray };

/** A folder's contents: a non-empty array of {@link FolderEntry}. */
export type FolderArray = FolderEntry[];

/** The manifest's `tree`: top-level folder name -> contents array. */
export type SecretsTree = Record<string, FolderArray>;

/** A single emitted key resolved from a folder (canonical name + aliases). */
export type CompiledKey = { key: string; aliases: string[] };

/** A folder path plus the exact keys to emit from it (provenance-aware). */
export type CompiledFolder = { path: string; keys: CompiledKey[] };

function pushIssues(
  ctx: z.RefinementCtx,
  result: z.SafeParseReturnType<unknown, unknown>,
  at: (string | number)[]
): void {
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({ ...issue, path: [...at, ...issue.path] });
  }
}

/**
 * Recursively validate a folder's contents array. Zod's recursive inference is
 * awkward for the mixed string / alias-object / subfolder-object element shape,
 * so structure and recursion are validated by hand here (leaf checks delegated
 * to the small env-var / alias-target schemas), giving precise, path-anchored
 * messages.
 */
function validateFolderArray(
  value: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): void {
  if (!Array.isArray(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "folder contents must be an array",
    });
    return;
  }
  if (value.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        'folder contents must be a non-empty array of keys, alias objects, or "/"-prefixed subfolders',
    });
  }
  value.forEach((entry, i) => validateFolderEntry(entry, ctx, [...path, i]));
}

function validateFolderEntry(
  entry: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): void {
  if (typeof entry === "string") {
    pushIssues(ctx, envVarNameSchema.safeParse(entry), path);
    return;
  }
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        'folder entry must be a key name (string), an alias object, or a "/"-prefixed subfolder',
    });
    return;
  }

  const keys = Object.keys(entry as Record<string, unknown>);
  if (keys.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "object entry must declare at least one alias or subfolder",
    });
  }

  for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
    const at = [...path, key];
    if (subfolderPattern.test(key)) {
      validateFolderArray(value, ctx, at);
    } else if (envVarNamePattern.test(key)) {
      pushIssues(ctx, aliasTargetsSchema.safeParse(value), at);
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: `invalid entry key "${key}"; must be an env var name (alias) or a "/"-prefixed subfolder`,
      });
    }
  }
}

/**
 * Schema for the manifest's `tree`. Keys are folder names; each value is a
 * folder contents array validated recursively. Cast to the precise
 * {@link SecretsTree} type — the base `z.record` infers `Record<string,
 * unknown>`, but every value is structurally a {@link FolderArray} once
 * {@link validateFolderArray} passes.
 */
export const treeSchema = z
  .record(
    z.string().regex(folderNamePattern, "folder name has invalid characters"),
    z.unknown()
  )
  .superRefine((tree, ctx) => {
    if (Object.keys(tree).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tree must declare at least one folder",
      });
    }
    for (const [name, entries] of Object.entries(tree)) {
      validateFolderArray(entries, ctx, [name]);
    }
  }) as unknown as z.ZodType<SecretsTree>;

/**
 * Flatten a validated folder tree into an ordered list of {@link CompiledFolder}.
 * String entries carry no aliases; each `SOURCE: target(s)` entry carries its
 * target(s). A folder's own keys are emitted before recursing into its
 * `/`-prefixed subfolders, so declaration order is preserved (last folder wins
 * on a genuine cross-folder name collision at merge time).
 */
export function compileTree(tree: SecretsTree): CompiledFolder[] {
  const out: CompiledFolder[] = [];
  for (const [name, entries] of Object.entries(tree)) {
    walk(name, entries, out);
  }
  return out;
}

function walk(path: string, entries: FolderArray, out: CompiledFolder[]): void {
  const keys: CompiledKey[] = [];
  const subfolders: Array<[string, FolderArray]> = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      keys.push({ key: entry, aliases: [] });
      continue;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (key.startsWith("/")) {
        // Subfolder: strip the leading `/` and join onto the parent path.
        subfolders.push([`${path}/${key.slice(1)}`, value as FolderArray]);
      } else {
        const targets = value as AliasSpec;
        keys.push({
          key,
          aliases: Array.isArray(targets) ? targets : [targets],
        });
      }
    }
  }

  if (keys.length > 0) {
    out.push({ path, keys });
  }
  for (const [subPath, subEntries] of subfolders) {
    walk(subPath, subEntries, out);
  }
}
