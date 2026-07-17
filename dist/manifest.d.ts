import { z } from "zod";
export declare const secretsManifestSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    paths: z.ZodArray<z.ZodString, "many">;
    profiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        paths: z.ZodArray<z.ZodString, "many">;
        include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        fetch: z.ZodOptional<z.ZodEnum<["folder", "keys"]>>;
    }, "strip", z.ZodTypeAny, {
        paths: string[];
        include?: string[] | undefined;
        fetch?: "keys" | "folder" | undefined;
    }, {
        paths: string[];
        include?: string[] | undefined;
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
    aliases: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>>;
    include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    fetch: z.ZodOptional<z.ZodEnum<["folder", "keys"]>>;
    environments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        optionalKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        optionalKeys?: string[] | undefined;
    }, {
        optionalKeys?: string[] | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    paths: string[];
    $schema?: string | undefined;
    include?: string[] | undefined;
    fetch?: "keys" | "folder" | undefined;
    profiles?: Record<string, {
        paths: string[];
        include?: string[] | undefined;
        fetch?: "keys" | "folder" | undefined;
    }> | undefined;
    ci?: {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    } | undefined;
    output?: string | undefined;
    aliases?: Record<string, string | string[]> | undefined;
    environments?: Record<string, {
        optionalKeys?: string[] | undefined;
    }> | undefined;
}, {
    paths: string[];
    $schema?: string | undefined;
    include?: string[] | undefined;
    fetch?: "keys" | "folder" | undefined;
    profiles?: Record<string, {
        paths: string[];
        include?: string[] | undefined;
        fetch?: "keys" | "folder" | undefined;
    }> | undefined;
    ci?: {
        skipWhenEnv?: string[] | undefined;
        stubInCi?: boolean | undefined;
    } | undefined;
    output?: string | undefined;
    aliases?: Record<string, string | string[]> | undefined;
    environments?: Record<string, {
        optionalKeys?: string[] | undefined;
    }> | undefined;
}>;
export type SecretsManifest = z.infer<typeof secretsManifestSchema>;
export declare function loadManifestJson(raw: unknown): SecretsManifest;
/** Profile paths replace default paths when a profile is set. */
export declare function resolvePaths(manifest: SecretsManifest, profile?: string): string[];
/**
 * Resolve the effective key allowlist. A profile's `include` replaces the root
 * `include` when the profile defines it; otherwise the root `include` applies.
 * Returns `undefined` when no allowlist is in effect (emit all keys).
 */
export declare function resolveInclude(manifest: SecretsManifest, profile?: string): string[] | undefined;
/**
 * Resolve the effective fetch mode. A profile's `fetch` replaces the root
 * `fetch` when the profile defines it; otherwise the root `fetch` applies.
 * Defaults to `"folder"` (whole-folder read + local filter) when unset.
 */
export declare function resolveFetchMode(manifest: SecretsManifest, profile?: string): "folder" | "keys";
/**
 * Cross-field rule: `fetch: "keys"` requires an `include` allowlist, because
 * key mode fetches exactly the keys `include` names. The check spans the root
 * and every profile (a profile's `fetch`/`include` each replace the root's), so
 * every runnable combination is covered. Returns human-readable issue strings
 * (empty when consistent) for `validate` to surface. Zod can't express this —
 * the requirement depends on the resolved profile.
 */
export declare function checkFetchIncludeConsistency(manifest: SecretsManifest): string[];
export declare function normalizeFolderPath(folder: string): string;
export declare function resolveSecretsOutputPath(manifestDir: string, outputName: string): string;
//# sourceMappingURL=manifest.d.ts.map