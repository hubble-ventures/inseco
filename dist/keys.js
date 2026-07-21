import { resolveCompiledFolders } from "./manifest.js";
// The snapshot / JSON schema version. Bump when the shape of an emitted payload
// or the committed `infisicml.keys.json` snapshot changes, so downstream tooling
// and the `keys --check` lockfile can evolve without a flag day. See ADR 0001.
export const KEYS_SCHEMA_VERSION = 1;
// The profile key used for a package's base (profile-less) tree in a snapshot.
// Real profile names are their manifest keys; this sentinel labels the default.
export const DEFAULT_PROFILE_LABEL = "(default)";
/**
 * The set of env var names a compiled folder list would emit: every canonical
 * key plus every alias target, deduped and sorted. Pure — no vault, no values,
 * no I/O.
 *
 * This is the *declared maximal* emitted set (see ADR 0001): an alias target is
 * counted even when its source secret is absent from the vault at runtime, and a
 * declared key is counted even when the vault lacks it. For v2 default-deny
 * manifests — where every emitted key is enumerated — this is exactly the
 * reviewable truth, and it never depends on the environment.
 */
export function emittedKeyNames(folders) {
    const names = new Set();
    for (const folder of folders) {
        for (const key of folder.keys) {
            names.add(key.key);
            for (const alias of key.aliases)
                names.add(alias);
        }
    }
    return [...names].sort();
}
/**
 * Emitted names for a manifest under an optional profile, tolerating a manifest
 * or profile that doesn't exist — the absent side contributes no keys (so a diff
 * reports them all as added/removed). `resolveCompiledFolders` throws on an
 * unknown profile; here an unknown profile (or a `null` manifest) is the empty
 * set instead, which is what a before/after comparison needs.
 */
export function emittedNamesFor(manifest, profile) {
    if (!manifest)
        return [];
    if (profile !== undefined && !manifest.profiles?.[profile])
        return [];
    return emittedKeyNames(resolveCompiledFolders(manifest, profile));
}
/** Names in `to` but not `from` (added) and in `from` but not `to` (removed). */
export function diffKeyNames(from, to) {
    const fromSet = new Set(from);
    const toSet = new Set(to);
    return {
        added: to.filter((k) => !fromSet.has(k)).sort(),
        removed: from.filter((k) => !toSet.has(k)).sort(),
    };
}
export function hasKeyChange(diff) {
    return diff.added.length > 0 || diff.removed.length > 0;
}
/** Every profile label to compare for a package: the default plus named profiles, sorted. */
export function profileLabels(manifest) {
    return [
        DEFAULT_PROFILE_LABEL,
        ...Object.keys(manifest.profiles ?? {}).sort(),
    ];
}
/** Map a snapshot profile label back to the profile argument (`undefined` for default). */
export function profileArg(label) {
    return label === DEFAULT_PROFILE_LABEL ? undefined : label;
}
/** Build the static emitted-names snapshot for a set of loaded manifests. */
export function buildSnapshot(manifests) {
    const packages = {};
    for (const { id, config } of [...manifests].sort((a, b) => a.id.localeCompare(b.id))) {
        const profiles = {};
        for (const label of profileLabels(config)) {
            profiles[label] = emittedNamesFor(config, profileArg(label));
        }
        packages[id] = profiles;
    }
    return { schemaVersion: KEYS_SCHEMA_VERSION, mode: "static", packages };
}
/**
 * Canonical JSON for a snapshot: schema fields first, then packages/profiles in
 * insertion order (already sorted by {@link buildSnapshot}), 2-space indent, and
 * a trailing newline. Deterministic, so `keys --all --json > infisicml.keys.json`
 * and a later `keys --all --check` compare byte-for-byte.
 */
export function serializeSnapshot(snapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`;
}
//# sourceMappingURL=keys.js.map