import type { SecretsManifest } from "./manifest.js";
export type ResolvedAlias = {
    source: string;
    targets: string[];
};
/** Normalize the manifest's alias map to a list of {source, targets[]}. */
export declare function resolveAliases(manifest: SecretsManifest): ResolvedAlias[];
/**
 * Copy each aliased source secret's value to its target env var name(s).
 *
 * Used wherever the CLI materializes secrets (CI `export-gha`, local
 * `.env.secrets` pull) so the conventional, tool-specific name each deployment
 * expects is always present — see the `aliases` doc in manifest.ts.
 *
 * Returns a new object. An absent source is skipped, and an existing target (a
 * real secret of that name) is never overwritten, so real values win over
 * aliases and the operation is idempotent.
 */
export declare function applyAliases(merged: Record<string, string>, manifest: SecretsManifest): Record<string, string>;
//# sourceMappingURL=aliases.d.ts.map