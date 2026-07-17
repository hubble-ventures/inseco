import { fetchCompiledFolders, materializeSecrets } from "../ci-skip.js";
import { loadConfig } from "../config.js";
import { normalizeEnvSlug } from "../env-slug.js";
import { appendSecretsToGithubEnv } from "../github-env.js";
import { runAdvertiseKeysHooks } from "../hooks.js";
import { normalizeFolderPath, resolveCompiledFolders, resolveFetchMode, } from "../manifest.js";
import { resolveOptionalKeys } from "../optional-keys.js";
import { RemoteProvider } from "../providers/remote.js";
import { discoverManifests } from "../registry.js";
/**
 * Canonical (pre-alias) key names to advertise, split runtime vs all.
 *
 * Classification is by **(path, key)** against the base tree, not by folder path
 * alone: a profile can reuse a base folder path and add deploy-only keys, so a
 * key counts as runtime only if the base tree declares *that key* under *that
 * path*. This keeps a deploy-only credential in a shared folder out of the
 * runtime-scoped advertise set (and thus out of runtime deploy forwarding).
 * Only keys actually in `emitted` are advertised, so an absent optional key is
 * never named.
 */
export function computeAdvertiseKeys(allFolders, baseFolders, emitted) {
    const baseKeysByPath = new Map();
    for (const f of baseFolders) {
        baseKeysByPath.set(f.path, new Set(f.keys.map((k) => k.key)));
    }
    const runtimeKeys = new Set();
    const allKeys = new Set();
    for (const folder of allFolders) {
        for (const key of folder.keys) {
            if (emitted[key.key] === undefined)
                continue;
            allKeys.add(key.key);
            if (baseKeysByPath.get(folder.path)?.has(key.key)) {
                runtimeKeys.add(key.key);
            }
        }
    }
    return { runtimeKeys: [...runtimeKeys], allKeys: [...allKeys] };
}
export async function runExportGha(options) {
    const config = await loadConfig(options.cwd);
    const envName = normalizeEnvSlug(process.env.INFISICAL_ENV_SLUG ?? options.env);
    const githubEnvPath = options.githubEnvPath ?? process.env.GITHUB_ENV ?? "";
    if (!githubEnvPath) {
        throw new Error("GITHUB_ENV is not set");
    }
    const projectSlug = options.projectSlug ?? process.env.INFISICAL_PROJECT_SLUG;
    if (!projectSlug) {
        throw new Error("INFISICAL_PROJECT_SLUG required");
    }
    const manifests = discoverManifests(config);
    const manifest = manifests.find((m) => m.id === options.packageId);
    if (!manifest) {
        throw new Error(`Unknown package id: ${options.packageId}`);
    }
    // The base tree holds the app's runtime secrets; a profile (e.g. `deploy`)
    // may replace it with a superset that also carries deploy-time credentials.
    const allFolders = resolveCompiledFolders(manifest.config, options.profile);
    const baseFolders = resolveCompiledFolders(manifest.config);
    const fetchMode = resolveFetchMode(manifest.config, options.profile);
    const identityId = options.identityId ?? process.env.INFISICAL_IDENTITY_ID;
    if (!identityId) {
        throw new Error("INFISICAL_IDENTITY_ID required — infisicml CI auth is GitHub OIDC only (no client-id/secret fallback). Set `permissions: id-token: write` on the job.");
    }
    const provider = new RemoteProvider({
        domain: config.infisicalDomain,
        projectSlug,
        identityId,
        oidcAudience: process.env.INFISICAL_OIDC_AUDIENCE ?? config.auth?.oidcAudience,
    });
    for (const folder of allFolders) {
        console.log(`Loading Infisical path ${normalizeFolderPath(folder.path)} (${envName})`);
    }
    // One per-folder fetch (token cached across folders). Per-folder alias
    // expansion + missing-key enforcement (before the merge) keeps provenance, so
    // a key declared in two folders can't have one folder's miss masked by the
    // other, nor one folder's value routed to the other's alias.
    const folderSecrets = await fetchCompiledFolders(provider, envName, allFolders, fetchMode);
    const optionalKeys = resolveOptionalKeys(manifest.config, envName);
    const merged = materializeSecrets(folderSecrets, optionalKeys);
    appendSecretsToGithubEnv(githubEnvPath, merged);
    // Advertise CANONICAL (pre-alias) key names. Alias targets (e.g.
    // NEXT_PUBLIC_*) are build-tool copies, not the names a server runtime reads,
    // so they are intentionally not advertised — they still land in the job env
    // via `merged` for build steps that need them.
    runAdvertiseKeysHooks(githubEnvPath, config.hooks?.advertiseKeys, computeAdvertiseKeys(allFolders, baseFolders, merged));
}
//# sourceMappingURL=export-gha.js.map