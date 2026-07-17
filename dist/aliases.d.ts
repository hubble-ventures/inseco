import type { CompiledFolder } from "./tree.js";
export type ResolvedAlias = {
    source: string;
    targets: string[];
};
/**
 * Collect the alias `source -> targets` pairs from the compiled folders. Each
 * `aliased` entry in the tree names a canonical vault key (the source) and the
 * extra env var name(s) a build/runtime expects (the targets).
 */
export declare function resolveAliases(folders: CompiledFolder[]): ResolvedAlias[];
/**
 * Copy each aliased source secret's value to its target env var name(s).
 *
 * Used wherever the CLI materializes secrets (CI `export-gha`, local
 * `.env.secrets` pull) so the conventional, tool-specific name each deployment
 * expects is always present — the vault names a secret once (e.g. /posthog
 * exposes POSTHOG_PROJECT_TOKEN), but build tools inline it by a tool-specific
 * name (Vite reads VITE_*, Next reads NEXT_PUBLIC_*).
 *
 * Returns a new object. An absent source is skipped, and an existing target (a
 * real secret of that name) is never overwritten, so real values win over
 * aliases and the operation is idempotent.
 */
export declare function applyAliases(merged: Record<string, string>, folders: CompiledFolder[]): Record<string, string>;
//# sourceMappingURL=aliases.d.ts.map