import { z } from "zod";
/**
 * One entry in a folder's contents array. Either:
 * - a **string** — a plain key emitted as-is, or
 * - an **object** whose entries are, per key, discriminated by value type:
 *   - `SOURCE: "TARGET"` (string value) — an alias (the canonical vault key
 *     `SOURCE` is emitted and copied to `TARGET`). Multiple targets? Repeat the
 *     entry, one target each.
 *   - `name: [ ... ]` (array value) — a subfolder (its own contents array).
 */
export type FolderEntry = string | {
    [key: string]: string | FolderArray;
};
/** A folder's contents: a non-empty array of {@link FolderEntry}. */
export type FolderArray = FolderEntry[];
/**
 * The manifest's `secrets`: a non-empty array of single-folder objects
 * (`{ folderName: contentsArray }`) — the top level of the tree.
 */
export type SecretsTree = Array<{
    [folder: string]: FolderArray;
}>;
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
 * Schema for the manifest's `secrets`: a non-empty array of folder objects, each
 * validated recursively. Cast to the precise {@link SecretsTree} type — the base
 * `z.array` infers `unknown[]`, but every element is structurally a folder
 * object once {@link validateFolderObject} passes.
 */
export declare const treeSchema: z.ZodType<SecretsTree>;
/**
 * Flatten a validated tree into an ordered list of {@link CompiledFolder}.
 * String entries carry no aliases; each `SOURCE: "TARGET"` entry carries its
 * single target (repeat the entry for several targets). A folder's own keys are
 * emitted before recursing into its subfolders, so declaration order is
 * preserved (last folder wins on a genuine cross-folder name collision at merge
 * time).
 */
export declare function compileTree(secrets: SecretsTree): CompiledFolder[];
//# sourceMappingURL=tree.d.ts.map