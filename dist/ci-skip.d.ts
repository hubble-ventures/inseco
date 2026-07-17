import type { SecretsManifest } from "./manifest.js";
import type { SecretsProvider } from "./providers/types.js";
import type { CompiledFolder } from "./tree.js";
export type { SecretsProvider };
/** A folder's declared keys paired with the values that folder actually held. */
export type FolderSecrets = {
    folder: CompiledFolder;
    /** Declared keys present in this folder (canonical, pre-alias). */
    selected: Record<string, string>;
};
export declare function mergeFolderSecrets(chunks: Record<string, string>[]): Record<string, string>;
/**
 * Fetch each compiled folder and select *that folder's* declared keys from it,
 * honoring the resolved `fetch` mode. `keys` mode requests only the declared
 * keys per folder (the tree names the exact canonical vault keys, so no
 * allowlist reverse-map is needed — the alias *source* is the real key);
 * `folder` mode reads the whole folder and picks the declared keys locally.
 *
 * Returns one {@link FolderSecrets} per folder so downstream steps keep folder
 * provenance: two folders declaring the same key name are distinct entries here,
 * and only collapse (last-wins) at the final merge — see {@link materializeSecrets}.
 */
export declare function fetchCompiledFolders(provider: SecretsProvider, envName: string, folders: CompiledFolder[], fetchMode: "folder" | "keys"): Promise<FolderSecrets[]>;
/**
 * Turn per-folder fetched secrets into the final emit map, preserving folder
 * provenance:
 *
 * - **Missing keys are checked per folder/key pair, before merging.** A key
 *   declared in `/a` but absent from `/a` is unknown even if a same-named key in
 *   `/b` was produced — so a genuine miss can't be masked by another folder.
 * - **Aliases expand from the folder-local value.** `/a`'s `TOKEN -> A_TOKEN`
 *   uses `/a`'s `TOKEN`, and `/b`'s `TOKEN -> B_TOKEN` uses `/b`'s — the flat
 *   merge (which keeps only one `TOKEN`) can no longer route one folder's secret
 *   to another folder's alias.
 *
 * Folder-local aliased maps then merge in tree order (last-wins on a genuine
 * cross-folder name collision). A declared key absent from its folder fails
 * unless its name is in `optionalKeys` for the environment.
 */
export declare function materializeSecrets(folderSecrets: FolderSecrets[], optionalKeys: string[]): Record<string, string>;
export declare function isCi(): boolean;
export declare function shouldSkipInfisicalPull(manifest: SecretsManifest, force: boolean): boolean;
export declare function keysForCiStub(manifest: SecretsManifest): string[];
//# sourceMappingURL=ci-skip.d.ts.map