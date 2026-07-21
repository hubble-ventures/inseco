import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { compileTree, treeSchema, } from "./tree.js";
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
        .record(z.string(), z.object({
        // Replaces the root `secrets` for this profile when running with
        // --profile (same replace-not-merge as v1 `paths`).
        secrets: treeSchema,
        // Overrides the root `fetch` for this profile when set.
        fetch: fetchModeSchema.optional(),
    }))
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
        .record(z.string(), z.object({
        optionalKeys: z.array(z.string()).optional(),
    }))
        .optional(),
});
export function loadManifestJson(raw) {
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
];
/** A generic name for the manifest, for messages that shouldn't hardcode an extension. */
export const MANIFEST_LABEL = "secrets manifest";
/**
 * Locate the manifest file in `dir`, preferring YAML over JSON
 * ({@link MANIFEST_FILENAMES}). Returns `null` when no manifest exists.
 *
 * A directory with more than one manifest file is a hard error: picking a winner
 * by preference order would let a stale or experimental `secrets.yaml` left next
 * to the intended `secrets.json` (or vice versa) silently change which secret
 * tree is pulled — and non-interactive lanes (the GitHub Action's `export-gha`)
 * would write it into `GITHUB_ENV` and still succeed. Refuse instead of guessing;
 * the operator removes the extra file to resolve.
 */
/**
 * Cheap presence check: does `dir` hold at least one manifest file? Used to
 * enumerate package directories without parsing or resolving ambiguity, so
 * discovery never throws on a manifest a command won't actually load.
 */
export function hasManifestFile(dir) {
    return MANIFEST_FILENAMES.some((name) => existsSync(join(dir, name)));
}
export function findManifestFile(dir) {
    const present = MANIFEST_FILENAMES.filter((name) => existsSync(join(dir, name)));
    if (present.length === 0)
        return null;
    if (present.length > 1) {
        throw new Error(`Ambiguous secrets manifest in ${dir}: found ${present.join(", ")}. ` +
            `Keep exactly one — remove the extra file(s) so it's unambiguous which secret tree is used.`);
    }
    const [filename] = present;
    return {
        path: join(dir, filename),
        filename,
        format: filename.endsWith(".json") ? "json" : "yaml",
    };
}
/**
 * Parse manifest source text into the raw object, dispatching on format. YAML is
 * a superset of JSON, but we parse each with its own reader so error messages
 * point at the right syntax. Does not validate against the schema — call
 * {@link loadManifestJson} for that. Used for both on-disk manifests and
 * manifest content read out of a git ref (`git show`), which never touches disk.
 */
export function parseManifestContent(raw, format) {
    return format === "yaml" ? parseYaml(raw) : JSON.parse(raw);
}
/**
 * Parse a manifest file's contents into the raw object, dispatching on format.
 */
export function parseManifestFile(file) {
    return parseManifestContent(readFileSync(file.path, "utf8"), file.format);
}
/**
 * The manifest format implied by a filename ({@link MANIFEST_FILENAMES}), or
 * `null` for a name that isn't a recognized manifest file. Used to parse
 * manifest content pulled from a git ref by filename, without a `ManifestFile`.
 */
export function manifestFormatForFilename(filename) {
    if (filename.endsWith(".json"))
        return "json";
    if (filename.endsWith(".yaml") || filename.endsWith(".yml"))
        return "yaml";
    return null;
}
/**
 * Find, read, parse, and schema-validate the manifest in `dir`. Returns the
 * validated manifest plus the file it came from, or `null` when no manifest
 * file exists.
 */
export function loadManifestFromDir(dir) {
    const file = findManifestFile(dir);
    if (!file)
        return null;
    return { manifest: loadManifestJson(parseManifestFile(file)), file };
}
/**
 * Compile the effective folder tree into an ordered {@link CompiledFolder} list.
 * A profile's `tree` replaces the root `tree` when a profile is set (same
 * replace-not-merge as v1 `paths`). Throws on an unknown profile name.
 */
export function resolveCompiledFolders(manifest, profile) {
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
export function resolveFetchMode(manifest, profile) {
    if (profile) {
        const profileFetch = manifest.profiles?.[profile]?.fetch;
        if (profileFetch !== undefined)
            return profileFetch;
    }
    return manifest.fetch ?? "folder";
}
export function normalizeFolderPath(folder) {
    return `/${folder.replace(/^\/+/, "")}`;
}
export function resolveSecretsOutputPath(manifestDir, outputName) {
    if (outputName !== outputName.split("/").pop() ||
        outputName.includes("..") ||
        outputName.length === 0) {
        throw new Error(`Invalid secrets output filename: ${outputName}`);
    }
    const resolvedDir = resolve(manifestDir);
    const resolvedOut = resolve(manifestDir, outputName);
    if (resolvedOut !== resolvedDir &&
        !resolvedOut.startsWith(resolvedDir + sep)) {
        throw new Error(`Secrets output escapes manifest directory: ${outputName}`);
    }
    return resolvedOut;
}
//# sourceMappingURL=manifest.js.map