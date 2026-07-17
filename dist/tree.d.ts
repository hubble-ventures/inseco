import { z } from "zod";
/** One alias target name, or several. */
export type AliasSpec = string | string[];
/**
 * One entry in a folder's contents array. Either:
 * - a **string** — a plain key emitted as-is, or
 * - an **object** whose entries are, per key:
 *   - `SOURCE: target | [targets]` — an alias (the canonical vault key `SOURCE`
 *     is emitted and copied to each target), or
 *   - `"/sub": [ ... ]` — a subfolder (its own contents array).
 */
export type FolderEntry = string | {
    [key: string]: AliasSpec | FolderArray;
};
/** A folder's contents: a non-empty array of {@link FolderEntry}. */
export type FolderArray = FolderEntry[];
/** The manifest's `tree`: top-level folder name -> contents array. */
export type SecretsTree = Record<string, FolderArray>;
/** A single emitted key resolved from a folder (canonical name + aliases). */
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
 * folder contents array validated recursively. Cast to the precise
 * {@link SecretsTree} type — the base `z.record` infers `Record<string,
 * unknown>`, but every value is structurally a {@link FolderArray} once
 * {@link validateFolderArray} passes.
 */
export declare const treeSchema: z.ZodType<SecretsTree>;
/**
 * Flatten a validated folder tree into an ordered list of {@link CompiledFolder}.
 * String entries carry no aliases; each `SOURCE: target(s)` entry carries its
 * target(s). A folder's own keys are emitted before recursing into its
 * `/`-prefixed subfolders, so declaration order is preserved (last folder wins
 * on a genuine cross-folder name collision at merge time).
 */
export declare function compileTree(tree: SecretsTree): CompiledFolder[];
//# sourceMappingURL=tree.d.ts.map