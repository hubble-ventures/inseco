import { z } from "zod";
import { type CompiledFolder } from "./tree.js";
export declare const secretsManifestSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    secrets: z.ZodType<import("./tree.js").SecretsTree, z.ZodTypeDef, import("./tree.js").SecretsTree>;
    profiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        secrets: z.ZodType<import("./tree.js").SecretsTree, z.ZodTypeDef, import("./tree.js").SecretsTree>;
        fetch: z.ZodOptional<z.ZodEnum<["folder", "keys"]>>;
    }, "strip", z.ZodTypeAny, {
        secrets: import("./tree.js").SecretsTree;
        fetch?: "keys" | "folder" | undefined;
    }, {
        secrets: import("./tree.js").SecretsTree;
        fetch?: "keys" | "folder" | undefined;
    }>>>;
    ci: z.ZodOptional<z.ZodObject<{
        skipWhenEnv: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        stubInCi: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    }, {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    }>>;
    output: z.ZodOptional<z.ZodString>;
    fetch: z.ZodOptional<z.ZodEnum<["folder", "keys"]>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        optionalKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        optionalKeys?: string[] | undefined;
    }, {
        optionalKeys?: string[] | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    secrets: import("./tree.js").SecretsTree;
    $schema?: string | undefined;
    fetch?: "keys" | "folder" | undefined;
    profiles?: Record<string, {
        secrets: import("./tree.js").SecretsTree;
        fetch?: "keys" | "folder" | undefined;
    }> | undefined;
    ci?: {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    } | undefined;
    output?: string | undefined;
    environments?: Record<string, {
        optionalKeys?: string[] | undefined;
    }> | undefined;
}, {
    secrets: import("./tree.js").SecretsTree;
    $schema?: string | undefined;
    fetch?: "keys" | "folder" | undefined;
    profiles?: Record<string, {
        secrets: import("./tree.js").SecretsTree;
        fetch?: "keys" | "folder" | undefined;
    }> | undefined;
    ci?: {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    } | undefined;
    output?: string | undefined;
    environments?: Record<string, {
        optionalKeys?: string[] | undefined;
    }> | undefined;
}>;
export type SecretsManifest = z.infer<typeof secretsManifestSchema>;
export declare function loadManifestJson(raw: unknown): SecretsManifest;
export declare const MANIFEST_FILENAMES: readonly ["secrets.yaml", "secrets.yml", "secrets.json"];
/** A generic name for the manifest, for messages that shouldn't hardcode an extension. */
export declare const MANIFEST_LABEL = "secrets manifest";
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
export declare function hasManifestFile(dir: string): boolean;
export declare function findManifestFile(dir: string): ManifestFile | null;
/**
 * Parse manifest source text into the raw object, dispatching on format. YAML is
 * a superset of JSON, but we parse each with its own reader so error messages
 * point at the right syntax. Does not validate against the schema — call
 * {@link loadManifestJson} for that. Used for both on-disk manifests and
 * manifest content read out of a git ref (`git show`), which never touches disk.
 */
export declare function parseManifestContent(raw: string, format: ManifestFormat): unknown;
/**
 * Parse a manifest file's contents into the raw object, dispatching on format.
 */
export declare function parseManifestFile(file: ManifestFile): unknown;
/**
 * The manifest format implied by a filename ({@link MANIFEST_FILENAMES}), or
 * `null` for a name that isn't a recognized manifest file. Used to parse
 * manifest content pulled from a git ref by filename, without a `ManifestFile`.
 */
export declare function manifestFormatForFilename(filename: string): ManifestFormat | null;
/**
 * Find, read, parse, and schema-validate the manifest in `dir`. Returns the
 * validated manifest plus the file it came from, or `null` when no manifest
 * file exists.
 */
export declare function loadManifestFromDir(dir: string): {
    manifest: SecretsManifest;
    file: ManifestFile;
} | null;
/**
 * Compile the effective folder tree into an ordered {@link CompiledFolder} list.
 * A profile's `tree` replaces the root `tree` when a profile is set (same
 * replace-not-merge as v1 `paths`). Throws on an unknown profile name.
 */
export declare function resolveCompiledFolders(manifest: SecretsManifest, profile?: string): CompiledFolder[];
/**
 * Resolve the effective fetch mode. A profile's `fetch` replaces the root
 * `fetch` when the profile defines it; otherwise the root `fetch` applies.
 * Defaults to `"folder"` (whole-folder read + local select) when unset.
 */
export declare function resolveFetchMode(manifest: SecretsManifest, profile?: string): "folder" | "keys";
export declare function normalizeFolderPath(folder: string): string;
export declare function resolveSecretsOutputPath(manifestDir: string, outputName: string): string;
//# sourceMappingURL=manifest.d.ts.map