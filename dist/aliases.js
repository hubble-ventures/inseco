/** Normalize the manifest's alias map to a list of {source, targets[]}. */
export function resolveAliases(manifest) {
    const aliases = manifest.aliases;
    if (!aliases)
        return [];
    return Object.entries(aliases).map(([source, value]) => ({
        source,
        targets: Array.isArray(value) ? value : [value],
    }));
}
/**
 * Copy each aliased source secret's value to its target env var name(s).
 *
 * Used wherever the CLI materializes secrets (CI `export-gha`, local
 * `.env.secrets` pull) so the conventional, tool-specific name each deployment
 * expects is always present — see the `aliases` doc in manifest.ts.
 *
 * Returns a new object. An absent source is skipped, and an existing target (a
 * real secret of that name) is never overwritten, so real values win over
 * aliases and the operation is idempotent.
 */
export function applyAliases(merged, manifest) {
    const out = { ...merged };
    for (const { source, targets } of resolveAliases(manifest)) {
        const value = merged[source];
        if (value === undefined)
            continue;
        for (const target of targets) {
            if (out[target] === undefined)
                out[target] = value;
        }
    }
    return out;
}
//# sourceMappingURL=aliases.js.map