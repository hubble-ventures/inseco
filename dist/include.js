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
    // Dedupe: the same key name can be declared-and-absent in more than one
    // folder, which would otherwise notice/report it twice.
    for (const name of new Set(unknown)) {
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
//# sourceMappingURL=include.js.map