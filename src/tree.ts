import { z } from "zod";

// A folder name (a top-level folder or a subfolder segment). Lowercase, digits,
// `_ - /`.
const folderNamePattern = /^[a-z0-9_/-]+$/;

const envVarNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const envVarNameSchema = z
  .string()
  .regex(envVarNamePattern, "must be a valid env var name");

/**
 * One entry in a folder's contents array. Either:
 * - a **string** — a plain key emitted as-is, or
 * - an **object** whose entries are, per key, discriminated by value type:
 *   - `SOURCE: "TARGET"` (string value) — an alias (the canonical vault key
 *     `SOURCE` is emitted and copied to `TARGET`). Multiple targets? Repeat the
 *     entry, one target each.
 *   - `name: [ ... ]` (array value) — a subfolder (its own contents array).
 */
export type FolderEntry = string | { [key: string]: string | FolderArray };

/** A folder's contents: a non-empty array of {@link FolderEntry}. */
export type FolderArray = FolderEntry[];

/**
 * The manifest's `secrets`: a non-empty array of single-folder objects
 * (`{ folderName: contentsArray }`) — the top level of the tree.
 */
export type SecretsTree = Array<{ [folder: string]: FolderArray }>;

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
 * Validate a top-level entry: a folder object `{ name: [ ...contents ] }`. A
 * folder's value must be an array — a string value at the top level would be an
 * alias with no folder to live in, which is meaningless.
 */
function validateFolderObject(
  entry: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): void {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: 'top-level entries must be folders: { "name": [ ... ] }',
    });
    return;
  }
  const names = Object.keys(entry as Record<string, unknown>);
  if (names.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "folder object must name a folder",
    });
  }
  for (const [name, value] of Object.entries(entry as Record<string, unknown>)) {
    const at = [...path, name];
    if (!folderNamePattern.test(name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: "folder name has invalid characters",
      });
    }
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: "a folder's value must be an array of its contents",
      });
      continue;
    }
    validateFolderArray(value, ctx, at);
  }
}

/**
 * Recursively validate a folder's contents array. Zod's recursive inference is
 * awkward for the mixed string / alias / subfolder shape, so structure and
 * recursion are validated by hand here, giving precise, path-anchored messages.
 * Value type discriminates an object entry: a **string** value is an alias
 * target, an **array** value is a subfolder.
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
        "folder contents must be a non-empty array of keys, aliases, or subfolders",
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
        "folder entry must be a key name (string), an alias, or a subfolder",
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
    if (Array.isArray(value)) {
      // Subfolder: the value is its own contents array.
      if (!folderNamePattern.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: at,
          message: "subfolder name has invalid characters",
        });
      }
      validateFolderArray(value, ctx, at);
    } else if (typeof value === "string") {
      // Alias: SOURCE (the entry key) -> TARGET (the value).
      pushIssues(ctx, envVarNameSchema.safeParse(key), at);
      pushIssues(ctx, envVarNameSchema.safeParse(value), at);
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message:
          "entry value must be a string (alias target) or an array (subfolder)",
      });
    }
  }
}

/**
 * Schema for the manifest's `secrets`: a non-empty array of folder objects, each
 * validated recursively. Cast to the precise {@link SecretsTree} type — the base
 * `z.array` infers `unknown[]`, but every element is structurally a folder
 * object once {@link validateFolderObject} passes.
 */
export const treeSchema = z
  .array(z.unknown())
  .superRefine((secrets, ctx) => {
    if (secrets.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "secrets must declare at least one folder",
      });
    }
    secrets.forEach((entry, i) => validateFolderObject(entry, ctx, [i]));
  }) as unknown as z.ZodType<SecretsTree>;

/**
 * Flatten a validated tree into an ordered list of {@link CompiledFolder}.
 * String entries carry no aliases; each `SOURCE: "TARGET"` entry carries its
 * single target (repeat the entry for several targets). A folder's own keys are
 * emitted before recursing into its subfolders, so declaration order is
 * preserved (last folder wins on a genuine cross-folder name collision at merge
 * time).
 */
export function compileTree(secrets: SecretsTree): CompiledFolder[] {
  const out: CompiledFolder[] = [];
  for (const folder of secrets) {
    for (const [name, contents] of Object.entries(folder)) {
      if (Array.isArray(contents)) walk(name, contents, out);
    }
  }
  return out;
}

function walk(path: string, contents: FolderArray, out: CompiledFolder[]): void {
  const keys: CompiledKey[] = [];
  const subfolders: Array<[string, FolderArray]> = [];

  for (const entry of contents) {
    if (typeof entry === "string") {
      keys.push({ key: entry, aliases: [] });
      continue;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (Array.isArray(value)) {
        subfolders.push([`${path}/${key}`, value]);
      } else {
        keys.push({ key, aliases: [value] });
      }
    }
  }

  if (keys.length > 0) {
    out.push({ path, keys });
  }
  for (const [subPath, subContents] of subfolders) {
    walk(subPath, subContents, out);
  }
}
