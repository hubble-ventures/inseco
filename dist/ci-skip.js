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