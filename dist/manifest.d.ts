import { z } from "zod";
export declare const secretsManifestSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    paths: z.ZodArray<z.ZodString, "many">;
    profiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        paths: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        paths: string[];
    }, {
        paths: string[];
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
    profiles?: Record<string, {
        paths: string[];
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
    profiles?: Record<string, {
        paths: string[];
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
export declare function normalizeFolderPath(folder: string): string;
export declare function resolveSecretsOutputPath(manifestDir: string, outputName: string): string;
//# sourceMappingURL=manifest.d.ts.map