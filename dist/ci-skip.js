import { resolveFetchKeys } from "./include.js";
import { resolveFetchMode, resolveInclude, } from "./manifest.js";
export function mergeFolderSecrets(chunks) {
    const merged = {};
    for (const chunk of chunks) {
        Object.assign(merged, chunk);
    }
    return merged;
}
export async function fetchSecretsForPaths(provider, envName, paths) {
    const chunks = [];
    for (const folder of paths) {
        chunks.push(await provider.exportFolder(envName, folder));
    }
    return mergeFolderSecrets(chunks);
}
/**
 * `fetch: "keys"` counterpart to {@link fetchSecretsForPaths}: request only the
 * given canonical keys from each folder and merge. A key absent from one folder
 * is simply not returned by that folder; the merge (last folder wins, matching
 * the folder path) collects it from whichever folder holds it.
 */
export async function fetchSecretsForKeys(provider, envName, paths, keys) {
    const chunks = [];
    for (const folder of paths) {
        chunks.push(await provider.exportKeys(envName, folder, keys));
    }
    return mergeFolderSecrets(chunks);
}
/**
 * Fetch a manifest's secrets for the given folder set, honoring its resolved
 * `fetch` mode: `keys` requests only the canonical keys `include` resolves to
 * (least privilege at the wire), `folder` reads whole folders. `keys` requires
 * an `include` allowlist — the whole point is to name exactly what to fetch.
 *
 * Callers pass an explicit `paths` subset (export-gha splits runtime vs
 * deploy-only) rather than re-deriving it, so the runtime/deploy provenance the
 * caller already computed is preserved.
 */
export async function fetchManifestSecrets(provider, envName, paths, manifest, profile) {
    if (resolveFetchMode(manifest, profile) === "keys") {
        const include = resolveInclude(manifest, profile);
        if (!include) {
            // resolveInclude already checked the profile then the root, so name the
            // exact place(s) that need an `include` rather than a vague "root or
            // profile" — the user should add it to whichever they're running.
            const where = profile
                ? `neither profile "${profile}" nor the manifest root defines one`
                : "the manifest root does not define one";
            throw new Error(`fetch: "keys" requires an include allowlist, but ${where}. ` +
                "Add `include: [...]` naming exactly which keys to request from the vault.");
        }
        return fetchSecretsForKeys(provider, envName, paths, resolveFetchKeys(include, manifest));
    }
    return fetchSecretsForPaths(provider, envName, paths);
}
export function isCi() {
    const ci = process.env.CI;
    return ci === "true" || ci === "1";
}
export function shouldSkipInfisicalPull(manifest, force) {
    if (force)
        return false;
    if (!isCi())
        return false;
    const ci = manifest.ci;
    if (!ci)
        return false;
    if (ci.stubInCi)
        return true;
    const keys = ci.skipWhenEnv ?? [];
    if (keys.length === 0)
        return false;
    return keys.every((key) => {
        const value = process.env[key];
        return value !== undefined && value !== "";
    });
}
export function keysForCiStub(manifest) {
    return manifest.ci?.skipWhenEnv ?? [];
}
//# sourceMappingURL=ci-skip.js.map