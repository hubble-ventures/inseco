import { type SecretsManifest } from "./manifest.js";
import type { CompiledFolder } from "./tree.js";
export declare const KEYS_SCHEMA_VERSION = 1;
export declare const DEFAULT_PROFILE_LABEL = "(default)";
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
export declare function emittedKeyNames(folders: CompiledFolder[]): string[];
/**
 * Emitted names for a manifest under an optional profile, tolerating a manifest
 * or profile that doesn't exist — the absent side contributes no keys (so a diff
 * reports them all as added/removed). `resolveCompiledFolders` throws on an
 * unknown profile; here an unknown profile (or a `null` manifest) is the empty
 * set instead, which is what a before/after comparison needs.
 */
export declare function emittedNamesFor(manifest: SecretsManifest | null, profile?: string): string[];
export type KeySetDiff = {
    added: string[];
    removed: string[];
};
/** Names in `to` but not `from` (added) and in `from` but not `to` (removed). */
export declare function diffKeyNames(from: string[], to: string[]): KeySetDiff;
export declare function hasKeyChange(diff: KeySetDiff): boolean;
/** Every profile label to compare for a package: the default plus named profiles, sorted. */
export declare function profileLabels(manifest: SecretsManifest): string[];
/** Map a snapshot profile label back to the profile argument (`undefined` for default). */
export declare function profileArg(label: string): string | undefined;
export type KeysSnapshot = {
    schemaVersion: number;
    mode: "static";
    packages: Record<string, Record<string, string[]>>;
};
/** Build the static emitted-names snapshot for a set of loaded manifests. */
export declare function buildSnapshot(manifests: {
    id: string;
    config: SecretsManifest;
}[]): KeysSnapshot;
/**
 * Canonical JSON for a snapshot: schema fields first, then packages/profiles in
 * insertion order (already sorted by {@link buildSnapshot}), 2-space indent, and
 * a trailing newline. Deterministic, so `keys --all --json > infisicml.keys.json`
 * and a later `keys --all --check` compare byte-for-byte.
 */
export declare function serializeSnapshot(snapshot: KeysSnapshot): string;
//# sourceMappingURL=keys.d.ts.map