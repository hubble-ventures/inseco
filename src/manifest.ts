import { resolve, sep } from "node:path";
import { z } from "zod";

const pathPattern = /^[a-z0-9_/-]+$/;

const pathsSchema = z
  .array(z.string().regex(pathPattern))
  .min(1, "paths must be a non-empty array");

const envVarNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const aliasSourceSchema = z
  .string()
  .regex(envVarNamePattern, "alias source must be a valid env var name");
const aliasTargetSchema = z
  .string()
  .regex(envVarNamePattern, "alias target must be a valid env var name");

// Key-level allowlist. When present, only these env var names are emitted from
// whatever the folders yielded (after aliases). `.min(1)` because an empty
// allowlist is almost certainly a mistake — omit the field to emit every key.
const includeSchema = z
  .array(z.string().regex(envVarNamePattern, "include entry must be a valid env var name"))
  .min(1, "include must be a non-empty array");

// How secrets are read from the vault. `folder` (default) fetches whole folders
// and filters locally. `keys` fetches only the exact keys `include` resolves to,
// so the vault never transmits the rest — wire-level least privilege. `keys`
// requires an `include` allowlist (enforced by resolveFetchKeys / validate,
// since the requirement depends on the resolved profile).
const fetchModeSchema = z.enum(["folder", "keys"]);

export const secretsManifestSchema = z.object({
  $schema: z.string().optional(),
  paths: pathsSchema,
  profiles: z
    .record(
      z.string(),
      z.object({
        paths: pathsSchema,
        // Replaces the root `include` for this profile when set; if omitted,
        // the root `include` applies (same replace-not-merge as `paths`).
        include: includeSchema.optional(),
        // Overrides the root `fetch` for this profile when set (same
        // replace-not-merge as `paths` / `include`).
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
  // Map a pulled secret to the extra env var name(s) a build/runtime expects.
  // The vault names a secret once (e.g. /clerk exposes the publishable key as
  // CLERK_PUBLISHABLE_KEY), but build tools inline it by a tool-specific,
  // convention-prefixed name — Vite reads VITE_*, Next reads NEXT_PUBLIC_*.
  // Declaring the mapping here means every consumer (CI export-gha, local pull)
  // emits the right name instead of each workflow re-deriving it.
  aliases: z
    .record(
      aliasSourceSchema,
      z.union([aliasTargetSchema, z.array(aliasTargetSchema).min(1)])
    )
    .optional(),
  // Emit only these keys from whatever the folders yielded (default-deny key
  // selection). Applied after `aliases`, to the final set of names — so a client
  // can pull a shared vendor folder but emit only its public key. Absent = emit
  // all (backward compatible). A per-profile `include` replaces this one.
  include: includeSchema.optional(),
  // Read strategy: `folder` (default) pulls whole folders and filters locally;
  // `keys` pulls only the keys `include` resolves to (least privilege at the
  // wire). A per-profile `fetch` replaces this one.
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

/** Profile paths replace default paths when a profile is set. */
export function resolvePaths(
  manifest: SecretsManifest,
  profile?: string
): string[] {
  if (profile) {
    const profileConfig = manifest.profiles?.[profile];
    if (!profileConfig) {
      throw new Error(`Unknown profile '${profile}' in secrets.json`);
    }
    return profileConfig.paths;
  }
  return manifest.paths;
}

/**
 * Resolve the effective key allowlist. A profile's `include` replaces the root
 * `include` when the profile defines it; otherwise the root `include` applies.
 * Returns `undefined` when no allowlist is in effect (emit all keys).
 */
export function resolveInclude(
  manifest: SecretsManifest,
  profile?: string
): string[] | undefined {
  if (profile) {
    const profileInclude = manifest.profiles?.[profile]?.include;
    if (profileInclude !== undefined) return profileInclude;
  }
  return manifest.include;
}

/**
 * Resolve the effective fetch mode. A profile's `fetch` replaces the root
 * `fetch` when the profile defines it; otherwise the root `fetch` applies.
 * Defaults to `"folder"` (whole-folder read + local filter) when unset.
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

/**
 * Cross-field rule: `fetch: "keys"` requires an `include` allowlist, because
 * key mode fetches exactly the keys `include` names. The check spans the root
 * and every profile (a profile's `fetch`/`include` each replace the root's), so
 * every runnable combination is covered. Returns human-readable issue strings
 * (empty when consistent) for `validate` to surface. Zod can't express this —
 * the requirement depends on the resolved profile.
 */
export function checkFetchIncludeConsistency(
  manifest: SecretsManifest
): string[] {
  const issues: string[] = [];
  const check = (profile: string | undefined, label: string) => {
    if (
      resolveFetchMode(manifest, profile) === "keys" &&
      resolveInclude(manifest, profile) === undefined
    ) {
      issues.push(`fetch: "keys" requires an include allowlist (${label})`);
    }
  };
  check(undefined, "root");
  for (const name of Object.keys(manifest.profiles ?? {})) {
    check(name, `profile "${name}"`);
  }
  return issues;
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
