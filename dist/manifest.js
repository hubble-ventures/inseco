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
export const secretsManifestSchema = z.object({
    $schema: z.string().optional(),
    paths: pathsSchema,
    profiles: z
        .record(z.string(), z.object({
        paths: pathsSchema,
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
    // Map a pulled secret to the extra env var name(s) a build/runtime expects.
    // The vault names a secret once (e.g. /clerk exposes the publishable key as
    // CLERK_PUBLISHABLE_KEY), but build tools inline it by a tool-specific,
    // convention-prefixed name — Vite reads VITE_*, Next reads NEXT_PUBLIC_*.
    // Declaring the mapping here means every consumer (CI export-gha, local pull)
    // emits the right name instead of each workflow re-deriving it.
    aliases: z
        .record(aliasSourceSchema, z.union([aliasTargetSchema, z.array(aliasTargetSchema).min(1)]))
        .optional(),
    environments: z
        .record(z.string(), z.object({
        optionalKeys: z.array(z.string()).optional(),
    }))
        .optional(),
});
export function loadManifestJson(raw) {
    return secretsManifestSchema.parse(raw);
}
/** Profile paths replace default paths when a profile is set. */
export function resolvePaths(manifest, profile) {
    if (profile) {
        const profileConfig = manifest.profiles?.[profile];
        if (!profileConfig) {
            throw new Error(`Unknown profile '${profile}' in secrets.json`);
        }
        return profileConfig.paths;
    }
    return manifest.paths;
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