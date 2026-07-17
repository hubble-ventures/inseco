import { resolve, sep } from "node:path";
import { z } from "zod";
import {
  type CompiledFolder,
  compileTree,
  treeSchema,
} from "./tree.js";

// How secrets are read from the vault. `folder` (default) fetches whole folders
// and selects the declared keys locally. `keys` fetches only the exact keys the
// tree declares, so the vault never transmits the rest — wire-level least
// privilege. Because the tree always names every key, `keys` needs no separate
// allowlist (unlike v1, where it required `include`).
const fetchModeSchema = z.enum(["folder", "keys"]);

export const secretsManifestSchema = z.object({
  $schema: z.string().optional(),
  // The folder tree: which Infisical folders to pull and, per folder, exactly
  // which keys to emit (`raw`) and how to alias them (`aliased`). Subfolders
  // nest via `/`-prefixed children. See tree.ts for the node grammar.
  tree: treeSchema,
  profiles: z
    .record(
      z.string(),
      z.object({
        // Replaces the root `tree` for this profile when running with
        // --profile (same replace-not-merge as v1 `paths`).
        tree: treeSchema,
        // Overrides the root `fetch` for this profile when set.
        fetch: fetchModeSchema.optional(),
      })
    )
    .optional(),
  ci: z
    .object({
      skipWhenEnv: z.array(z.string()).optional(),
      stubInCi: z.boolean().optional(),
    })
    .optional(),
  output: z
    .string()
    .regex(/^[^/\\]+$/)
    .optional(),
  // Read strategy: `folder` (default) pulls whole folders and selects the
  // declared keys locally; `keys` pulls only the declared keys (least privilege
  // at the wire). A per-profile `fetch` replaces this one.
  fetch: fetchModeSchema.optional(),
  environments: z
    .record(
      z.string(),
      z.object({
        optionalKeys: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

export type SecretsManifest = z.infer<typeof secretsManifestSchema>;

export function loadManifestJson(raw: unknown): SecretsManifest {
  return secretsManifestSchema.parse(raw);
}

/**
 * Compile the effective folder tree into an ordered {@link CompiledFolder} list.
 * A profile's `tree` replaces the root `tree` when a profile is set (same
 * replace-not-merge as v1 `paths`). Throws on an unknown profile name.
 */
export function resolveCompiledFolders(
  manifest: SecretsManifest,
  profile?: string
): CompiledFolder[] {
  if (profile) {
    const profileConfig = manifest.profiles?.[profile];
    if (!profileConfig) {
      throw new Error(`Unknown profile '${profile}' in secrets.json`);
    }
    return compileTree(profileConfig.tree);
  }
  return compileTree(manifest.tree);
}

/**
 * Resolve the effective fetch mode. A profile's `fetch` replaces the root
 * `fetch` when the profile defines it; otherwise the root `fetch` applies.
 * Defaults to `"folder"` (whole-folder read + local select) when unset.
 */
export function resolveFetchMode(
  manifest: SecretsManifest,
  profile?: string
): "folder" | "keys" {
  if (profile) {
    const profileFetch = manifest.profiles?.[profile]?.fetch;
    if (profileFetch !== undefined) return profileFetch;
  }
  return manifest.fetch ?? "folder";
}

export function normalizeFolderPath(folder: string): string {
  return `/${folder.replace(/^\/+/, "")}`;
}

export function resolveSecretsOutputPath(
  manifestDir: string,
  outputName: string
): string {
  if (
    outputName !== outputName.split("/").pop() ||
    outputName.includes("..") ||
    outputName.length === 0
  ) {
    throw new Error(`Invalid secrets output filename: ${outputName}`);
  }
  const resolvedDir = resolve(manifestDir);
  const resolvedOut = resolve(manifestDir, outputName);
  if (
    resolvedOut !== resolvedDir &&
    !resolvedOut.startsWith(resolvedDir + sep)
  ) {
    throw new Error(`Secrets output escapes manifest directory: ${outputName}`);
  }
  return resolvedOut;
}
