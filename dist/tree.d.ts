import { z } from "zod";
/** One alias target name, or several. */
export type AliasSpec = string | string[];
/**
 * A node in the folder tree. Declares the keys pulled from *this* folder via the
 * `raw` and `aliased` buckets, plus any number of `/`-prefixed subfolders. The
 * index signature is intentionally `unknown` (a supertype of the bucket types)
 * so `/child` values type-check while `raw`/`aliased` keep their precise types.
 */
export type FolderNode = {
    raw?: string[];
    aliased?: Record<string, AliasSpec>;
} & {
    [subfolder: string]: unknown;
};
/** The manifest's `tree`: top-level folder name -> node. */
export type SecretsTree = Record<string, FolderNode>;
/** A single emitted key resolved from a folder node (canonical name + aliases). */
export type CompiledKey = {
    key: string;
    aliases: string[];
};
/** A folder path plus the exact keys to emit from it (provenance-aware). */
export type CompiledFolder = {
    path: string;
    keys: CompiledKey[];
};
/**
 * Schema for the manifest's `tree`. Keys are folder names; each value is a
 * folder node validated recursively. Cast to the precise {@link SecretsTree}
 * type — the base `z.record` infers `Record<string, unknown>`, but every value
 * is structurally a {@link FolderNode} once `validateFolderNode` passes.
 */
export declare const treeSchema: z.ZodType<SecretsTree>;
/**
 * Flatten a validated folder tree into an ordered list of {@link CompiledFolder}.
 * `raw` entries carry no aliases; each `aliased` source carries its target(s).
 * A node's own keys are emitted before recursing into its `/`-prefixed
 * subfolders, so declaration order is preserved (last folder wins on a genuine
 * cross-folder name collision at merge time).
 */
export declare function compileTree(tree: SecretsTree): CompiledFolder[];
//# sourceMappingURL=tree.d.ts.map