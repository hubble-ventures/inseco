import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
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
  // The folder tree: an array of `{ folder: [ ...contents ] }` objects naming
  // which Infisical folders to pull and, per folder, exactly which keys to emit
  // (bare strings) and how to alias them (`{ SOURCE: "TARGET" }`). Subfolders
  // nest as `{ name: [ ... ] }`. See tree.ts for the entry grammar.
  secrets: treeSchema,
  profiles: z
    .record(
      z.string(),
      z.object({
        // Replaces the root `secrets` for this profile when running with
        // --profile (same replace-not-merge as v1 `paths`).
        secrets: treeSchema,
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

// Manifest filenames in preference order. YAML is the primary, recommended
// format; JSON stays fully supported for anyone who prefers it (or generates
// manifests programmatically). The first file that exists in a package
// directory wins, so `secrets.yaml` shadows a stray `secrets.json`.
export const MANIFEST_FILENAMES = [
  "secrets.yaml",
  "secrets.yml",
  "secrets.json",
] as const;

/** A generic name for the manifest, for messages that shouldn't hardcode an extension. */
export const MANIFEST_LABEL = "secrets manifest";

export type ManifestFormat = "yaml" | "json";

export type ManifestFile = {
  /** Absolute (or as-passed) path to the manifest file. */
  path: string;
  /** Bare filename, e.g. `secrets.yaml`. */
  filename: string;
  format: ManifestFormat;
};

/**
 * Locate the manifest file in `dir`, preferring YAML over JSON
 * ({@link MANIFEST_FILENAMES}). Returns `null` when no manifest exists.
 *
 * When a directory holds more than one manifest file, the preference order
 * picks the winner and a warning names the shadowed file(s) — so a stale or
 * experimental `secrets.yaml` left next to the intended `secrets.json` (or vice
 * versa) never silently changes which secret tree is pulled.
 */
export function findManifestFile(dir: string): ManifestFile | null {
  const present = MANIFEST_FILENAMES.filter((name) =>
    existsSync(join(dir, name))
  );
  if (present.length === 0) return null;

  const [filename, ...shadowed] = present;
  if (shadowed.length > 0) {
    console.warn(
      `⚠️  Multiple secrets manifests in ${dir}: using ${filename}, ignoring ${shadowed.join(", ")}. Remove the extra file(s) to silence this.`
    );
  }
  return {
    path: join(dir, filename),
    filename,
    format: filename.endsWith(".json") ? "json" : "yaml",
  };
}

/**
 * Parse a manifest file's contents into the raw object, dispatching on format.
 * YAML is a superset of JSON, but we parse each with its own reader so error
 * messages point at the right syntax. Does not validate against the schema —
 * call {@link loadManifestJson} for that.
 */
export function parseManifestFile(file: ManifestFile): unknown {
  const raw = readFileSync(file.path, "utf8");
  return file.format === "yaml" ? parseYaml(raw) : JSON.parse(raw);
}

/**
 * Find, read, parse, and schema-validate the manifest in `dir`. Returns the
 * validated manifest plus the file it came from, or `null` when no manifest
 * file exists.
 */
export function loadManifestFromDir(
  dir: string
): { manifest: SecretsManifest; file: ManifestFile } | null {
  const file = findManifestFile(dir);
  if (!file) return null;
  return { manifest: loadManifestJson(parseManifestFile(file)), file };
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
      throw new Error(`Unknown profile '${profile}' in ${MANIFEST_LABEL}`);
    }
    return compileTree(profileConfig.secrets);
  }
  return compileTree(manifest.secrets);
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
