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