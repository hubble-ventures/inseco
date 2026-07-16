import { resolveInclude } from "./manifest.js";
/**
 * Filter a materialized secret map down to the `include` allowlist.
 *
 * Runs *after* {@link applyAliases}, so it filters the final set of names: an
 * alias whose source isn't listed still emits its target, and a canonical key
 * not listed is dropped even when its alias target is kept.
 *
 * When `include` is `undefined` this is a pass-through (emit all keys) — the
 * backward-compatible default. Returns a new object; the input is not mutated.
 */
export function applyInclude(merged, include) {
    if (include === undefined) {
        return { filtered: merged, unknown: [] };
    }
    const allow = new Set(include);
    const filtered = {};
    for (const [key, value] of Object.entries(merged)) {
        if (allow.has(key))
            filtered[key] = value;
    }
    const unknown = include.filter((name) => !(name in merged));
    return { filtered, unknown };
}
/**
 * An `include` name that no folder produced is treated like a missing required
 * key: fail, unless it's listed in the environment's `optionalKeys`, in which
 * case it's downgraded to a `::notice::`. Enforced identically in `pull` and
 * `export-gha` so the two surfaces stay consistent.
 */
export function enforceIncludeKnown(unknown, optionalKeys) {
    const optional = new Set(optionalKeys);
    const missing = [];
    for (const name of unknown) {
        if (optional.has(name)) {
            console.log(`::notice::include key ${name} not produced by any folder (optional for this environment)`);
        }
        else {
            missing.push(name);
        }
    }
    if (missing.length > 0) {
        throw new Error(`include lists key(s) not produced by any pulled folder: ${missing.join(", ")}. ` +
            "Fix the name, add the folder, or list the key in environments.<slug>.optionalKeys to allow absence.");
    }
}
/**
 * Shared allowlist step for both emit surfaces: resolve the effective `include`
 * (root, or the profile's if it defines one), filter the aliased map to it, and
 * enforce the unknown-key policy. Returns the filtered map to emit.
 */
export function selectEmittedSecrets(aliased, manifest, profile, optionalKeys) {
    const include = resolveInclude(manifest, profile);
    const { filtered, unknown } = applyInclude(aliased, include);
    enforceIncludeKnown(unknown, optionalKeys);
    return filtered;
}
//# sourceMappingURL=include.js.map