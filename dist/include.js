/**
 * A declared key (a tree `raw` entry or `aliased` source) that no folder
 * produced is treated like a missing required key: fail, unless it's listed in
 * the environment's `optionalKeys`, in which case it's downgraded to a
 * `::notice::`. Enforced identically in `pull` and `export-gha` so the two
 * surfaces stay consistent.
 */
export function enforceKnownKeys(unknown, optionalKeys) {
    const optional = new Set(optionalKeys);
    const missing = [];
    for (const name of unknown) {
        if (optional.has(name)) {
            console.log(`::notice::declared key ${name} not produced by its folder (optional for this environment)`);
        }
        else {
            missing.push(name);
        }
    }
    if (missing.length > 0) {
        throw new Error(`tree declares key(s) not produced by any pulled folder: ${missing.join(", ")}. ` +
            "Fix the name, add the folder, or list the key in environments.<slug>.optionalKeys to allow absence.");
    }
}
/**
 * Final emit step for both surfaces (CI `export-gha`, local `pull`): the fetch
 * already selected exactly the declared keys per folder, so nothing is filtered
 * here — the aliased map (declared keys + their alias targets) is emitted whole.
 * This step only enforces that every declared canonical key was actually
 * produced; a declared key absent from its folder is missing from `aliased`
 * (its alias target too, since {@link applyAliases} skips an absent source), so
 * it surfaces as an unknown and fails unless it's optional for this environment.
 */
export function selectEmittedSecrets(aliased, declaredKeys, optionalKeys) {
    const unknown = declaredKeys.filter((key) => !(key in aliased));
    enforceKnownKeys(unknown, optionalKeys);
    return { ...aliased };
}
//# sourceMappingURL=include.js.map