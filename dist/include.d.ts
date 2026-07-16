import { type SecretsManifest } from "./manifest.js";
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
 * Shared allowlist step for both emit surfaces: resolve the effective `include`
 * (root, or the profile's if it defines one), filter the aliased map to it, and
 * enforce the unknown-key policy. Returns the filtered map to emit.
 */
export declare function selectEmittedSecrets(aliased: Record<string, string>, manifest: SecretsManifest, profile: string | undefined, optionalKeys: string[]): Record<string, string>;
//# sourceMappingURL=include.d.ts.map