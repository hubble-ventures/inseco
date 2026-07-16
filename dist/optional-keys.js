export function resolveOptionalKeys(manifest, envName) {
    return manifest.environments?.[envName]?.optionalKeys ?? [];
}
export function logMissingOptionalKeys(merged, optionalKeys) {
    for (const key of optionalKeys) {
        if (!merged[key]?.trim()) {
            console.log(`::notice::Optional secret ${key} not set (allowed for this environment)`);
        }
    }
}
//# sourceMappingURL=optional-keys.js.map