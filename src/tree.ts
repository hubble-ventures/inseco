import { z } from "zod";

// A folder name (a top-level `tree` key or the literal path of a folder node).
// Same character set as v1 `paths`: lowercase, digits, `_ - /`.
const folderNamePattern = /^[a-z0-9_/-]+$/;

// A subfolder child key: a `/`-prefixed segment (e.g. `/sub`, `/vendor/app`).
// The leading slash is what distinguishes a subfolder from the reserved `raw` /
// `aliased` buckets and from a key — env var names never start with `/`.
const subfolderPattern = /^\/[a-z0-9_/-]+$/;

const envVarNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const envVarNameSchema = z
  .string()
  .regex(envVarNamePattern, "must be a valid env var name");

// `raw`: plain keys emitted as-is. Non-empty — an empty array is a mistake
// (omit the bucket instead).
const rawSchema = z
  .array(envVarNameSchema)
  .min(1, "raw must be a non-empty array of env var names");

// `aliased`: canonical vault key -> the extra env var name(s) a build/runtime
// expects (e.g. POSTHOG_PROJECT_TOKEN -> VITE_POSTHOG_KEY). The map key is the
// real vault key (the alias *source*); the value is one or more alias targets.
// Non-empty — an empty `aliased` bucket declares no keys, so it would compile to
// nothing and silently fetch/write zero secrets for the folder; reject it to
// match the JSON schema's `minProperties: 1` (omit the bucket instead).
const aliasedSchema = z
  .record(
    envVarNameSchema,
    z.union([envVarNameSchema, z.array(envVarNameSchema).min(1)])
  )
  .refine((aliases) => Object.keys(aliases).length > 0, {
    message: "aliased must be a non-empty object of env var aliases",
  });

/** One alias target name, or several. */
export type AliasSpec = string | string[];

/**
 * A node in the folder tree. Declares the keys pulled from *this* folder via the
 * `raw` and `aliased` buckets, plus any number of `/`-prefixed subfolders. The
 * index signature is intentionally `unknown` (a supertype of the bucket types)
 * so `/child` values type-check while `raw`/`aliased` keep their precise types.
 */
export type FolderNode = {
  raw?: string[];
  aliased?: Record<string, AliasSpec>;
} & { [subfolder: string]: unknown };

/** The manifest's `tree`: top-level folder name -> node. */
export type SecretsTree = Record<string, FolderNode>;

/** A single emitted key resolved from a folder node (canonical name + aliases). */
export type CompiledKey = { key: string; aliases: string[] };

/** A folder path plus the exact keys to emit from it (provenance-aware). */
export type CompiledFolder = { path: string; keys: CompiledKey[] };

/**
 * Recursively validate a folder node. Zod's recursive-type inference is awkward
 * for the mixed fixed-buckets + patterned-subfolders shape, so structure and
 * recursion are validated by hand here (with the leaf buckets delegated to
 * `rawSchema` / `aliasedSchema`), giving precise, path-anchored messages.
 */
function validateFolderNode(
  node: unknown,
  ctx: z.RefinementCtx,
  path: (string | number)[]
): void {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: "folder node must be an object",
    });
    return;
  }

  const keys = Object.keys(node as Record<string, unknown>);
  if (keys.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        'folder node must declare at least one of: "raw", "aliased", or a "/"-prefixed subfolder',
    });
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const at = [...path, key];
    if (key === "raw") {
      const r = rawSchema.safeParse(value);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ ...issue, path: [...at, ...issue.path] });
        }
      }
    } else if (key === "aliased") {
      const r = aliasedSchema.safeParse(value);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ ...issue, path: [...at, ...issue.path] });
        }
      }
    } else if (subfolderPattern.test(key)) {
      validateFolderNode(value, ctx, at);
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: at,
        message: `unknown property "${key}"; folder children must be "raw", "aliased", or a "/"-prefixed subfolder`,
      });
    }
  }
}

/**
 * Schema for the manifest's `tree`. Keys are folder names; each value is a
 * folder node validated recursively. Cast to the precise {@link SecretsTree}
 * type — the base `z.record` infers `Record<string, unknown>`, but every value
 * is structurally a {@link FolderNode} once `validateFolderNode` passes.
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
    for (const [name, node] of Object.entries(tree)) {
      validateFolderNode(node, ctx, [name]);
    }
  }) as unknown as z.ZodType<SecretsTree>;

/**
 * Flatten a validated folder tree into an ordered list of {@link CompiledFolder}.
 * `raw` entries carry no aliases; each `aliased` source carries its target(s).
 * A node's own keys are emitted before recursing into its `/`-prefixed
 * subfolders, so declaration order is preserved (last folder wins on a genuine
 * cross-folder name collision at merge time).
 */
export function compileTree(tree: SecretsTree): CompiledFolder[] {
  const out: CompiledFolder[] = [];
  for (const [name, node] of Object.entries(tree)) {
    walk(name, node, out);
  }
  return out;
}

function walk(path: string, node: FolderNode, out: CompiledFolder[]): void {
  const keys: CompiledKey[] = [];
  for (const key of node.raw ?? []) {
    keys.push({ key, aliases: [] });
  }
  for (const [source, targets] of Object.entries(node.aliased ?? {})) {
    keys.push({
      key: source,
      aliases: Array.isArray(targets) ? targets : [targets],
    });
  }
  if (keys.length > 0) {
    out.push({ path, keys });
  }
  for (const [childKey, childNode] of Object.entries(node)) {
    if (childKey === "raw" || childKey === "aliased") continue;
    // Subfolder: strip the leading `/` and join onto the parent path.
    walk(`${path}/${childKey.slice(1)}`, childNode as FolderNode, out);
  }
}
