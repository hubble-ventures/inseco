/**
 * A declared key (a tree `raw` entry or `aliased` source) that no folder
 * produced is treated like a missing required key: fail, unless it's listed in
 * the environment's `optionalKeys`, in which case it's downgraded to a
 * `::notice::`. Enforced identically in `pull` and `export-gha` so the two
 * surfaces stay consistent.
 */
export declare function enforceKnownKeys(unknown: string[], optionalKeys: string[]): void;
/**
 * Final emit step for both surfaces (CI `export-gha`, local `pull`): the fetch
 * already selected exactly the declared keys per folder, so nothing is filtered
 * here — the aliased map (declared keys + their alias targets) is emitted whole.
 * This step only enforces that every declared canonical key was actually
 * produced; a declared key absent from its folder is missing from `aliased`
 * (its alias target too, since {@link applyAliases} skips an absent source), so
 * it surfaces as an unknown and fails unless it's optional for this environment.
 */
export declare function selectEmittedSecrets(aliased: Record<string, string>, declaredKeys: string[], optionalKeys: string[]): Record<string, string>;
//# sourceMappingURL=include.d.ts.map