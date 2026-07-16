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