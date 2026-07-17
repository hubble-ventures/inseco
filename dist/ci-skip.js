import { applyAliases } from "./aliases.js";
import { enforceKnownKeys } from "./include.js";
export function mergeFolderSecrets(chunks) {
    const merged = {};
    for (const chunk of chunks) {
        Object.assign(merged, chunk);
    }
    return merged;
}
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
export async function fetchCompiledFolders(provider, envName, folders, fetchMode) {
    const out = [];
    for (const folder of folders) {
        const declared = folder.keys.map((k) => k.key);
        const raw = fetchMode === "keys"
            ? await provider.exportKeys(envName, folder.path, declared)
            : await provider.exportFolder(envName, folder.path);
        const selected = {};
        for (const key of declared) {
            if (key in raw)
                selected[key] = raw[key];
        }
        out.push({ folder, selected });
    }
    return out;
}
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
export function materializeSecrets(folderSecrets, optionalKeys) {
    const unknown = [];
    const chunks = [];
    for (const { folder, selected } of folderSecrets) {
        for (const key of folder.keys) {
            if (!(key.key in selected))
                unknown.push(key.key);
        }
        chunks.push(applyAliases(selected, [folder]));
    }
    enforceKnownKeys(unknown, optionalKeys);
    return mergeFolderSecrets(chunks);
}
export function isCi() {
    const ci = process.env.CI;
    return ci === "true" || ci === "1";
}
export function shouldSkipInfisicalPull(manifest, force) {
    if (force)
        return false;
    if (!isCi())
        return false;
    const ci = manifest.ci;
    if (!ci)
        return false;
    if (ci.stubInCi)
        return true;
    const keys = ci.skipWhenEnv ?? [];
    if (keys.length === 0)
        return false;
    return keys.every((key) => {
        const value = process.env[key];
        return value !== undefined && value !== "";
    });
}
export function keysForCiStub(manifest) {
    return manifest.ci?.skipWhenEnv ?? [];
}
//# sourceMappingURL=ci-skip.js.map