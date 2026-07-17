import type { SecretsManifest } from "./manifest.js";
/**
 * Resolve the canonical vault keys to request in `fetch: "keys"` mode.
 *
 * `include` names the *final* (post-{@link applyAliases}) keys, but the vault is
 * keyed by canonical names. For each `include` entry we request the name itself
 * (it may be a real vault key) plus any alias *source* whose target is that name
 * (so the source value exists to materialize the target). Phantom entries — an
 * alias target that isn't a real vault key — simply miss on fetch, which is
 * harmless: the post-fetch {@link selectEmittedSecrets} still validates the
 * emitted set against `include`, so a genuinely-missing key fails there exactly
 * as in folder mode.
 */
export declare function resolveFetchKeys(include: string[], manifest: SecretsManifest): string[];
export type IncludeResult = {
    /** The emitted map after allowlist filtering. */
    filtered: Record<string, string>;
    /** `include` names that no folder produced (absent from the input map). */
    unknown: string[];
};
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
export declare function applyInclude(merged: Record<string, string>, include: string[] | undefined): IncludeResult;
/**
 * An `include` name that no folder produced is treated like a missing required
 * key: fail, unless it's listed in the environment's `optionalKeys`, in which
 * case it's downgraded to a `::notice::`. Enforced identically in `pull` and
 * `export-gha` so the two surfaces stay consistent.
 */
export declare function enforceIncludeKnown(unknown: string[], optionalKeys: string[]): void;
/**
 * Shared allowlist step for both emit surfaces: filter the aliased map to the
 * (already-resolved) `include` and enforce the unknown-key policy. Callers
 * resolve `include` once — with {@link resolveInclude} — so the value they use
 * for headers/logging is the same one that governs the filter.
 */
export declare function selectEmittedSecrets(aliased: Record<string, string>, include: string[] | undefined, optionalKeys: string[]): Record<string, string>;
//# sourceMappingURL=include.d.ts.map