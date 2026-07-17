/**
 * A declared key (a tree `raw` entry or `aliased` source) that no folder
 * produced is treated like a missing required key: fail, unless it's listed in
 * the environment's `optionalKeys`, in which case it's downgraded to a
 * `::notice::`. Enforced identically in `pull` and `export-gha` so the two
 * surfaces stay consistent.
 */
export declare function enforceKnownKeys(unknown: string[], optionalKeys: string[]): void;
//# sourceMappingURL=include.d.ts.map