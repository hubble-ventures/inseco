export function mergeFolderSecrets(chunks) {
    const merged = {};
    for (const chunk of chunks) {
        Object.assign(merged, chunk);
    }
    return merged;
}
/**
 * Fetch a manifest's secrets from its compiled folders, honoring the resolved
 * `fetch` mode, and select each folder's declared keys from *that* folder
 * (provenance-aware). `keys` mode requests only the declared keys per folder
 * (the tree names the exact canonical vault keys, so no allowlist reverse-map is
 * needed — the alias *source* is the real key); `folder` mode reads the whole
 * folder and picks the declared keys locally. Folders merge in tree order, so a
 * genuine cross-folder name collision resolves last-wins.
 *
 * Callers pass an explicit `folders` subset (export-gha splits runtime vs
 * deploy-only) rather than re-deriving it, so the provenance the caller already
 * computed is preserved.
 */
export async function fetchCompiledSecrets(provider, envName, folders, fetchMode) {
    const chunks = [];
    for (const folder of folders) {
        const declared = folder.keys.map((k) => k.key);
        const raw = fetchMode === "keys"
            ? await provider.exportKeys(envName, folder.path, declared)
            : await provider.exportFolder(envName, folder.path);
        const selected = {};
        for (const key of declared) {
            if (key in raw)
                selected[key] = raw[key];
        }
        chunks.push(selected);
    }
    return mergeFolderSecrets(chunks);
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