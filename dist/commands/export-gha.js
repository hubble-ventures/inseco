import { applyAliases } from "../aliases.js";
import { fetchCompiledSecrets } from "../ci-skip.js";
import { loadConfig } from "../config.js";
import { normalizeEnvSlug } from "../env-slug.js";
import { appendSecretsToGithubEnv } from "../github-env.js";
import { runAdvertiseKeysHooks } from "../hooks.js";
import { selectEmittedSecrets } from "../include.js";
import { normalizeFolderPath, resolveCompiledFolders, resolveFetchMode, } from "../manifest.js";
import { resolveOptionalKeys } from "../optional-keys.js";
import { RemoteProvider } from "../providers/remote.js";
import { discoverManifests } from "../registry.js";
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
    // Split by folder path so we advertise only runtime keys for deploy
    // forwarding.
    const allFolders = resolveCompiledFolders(manifest.config, options.profile);
    const fetchMode = resolveFetchMode(manifest.config, options.profile);
    const basePaths = new Set(resolveCompiledFolders(manifest.config).map((f) => f.path));
    const runtimeFolders = allFolders.filter((f) => basePaths.has(f.path));
    const deployOnlyFolders = allFolders.filter((f) => !basePaths.has(f.path));
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
    // Two calls (runtime then deploy-only), reusing the cached access token, so we
    // know which keys are runtime. Each call selects its folders' declared keys
    // from those folders (provenance-aware), so the split survives the merge.
    const runtimeSecrets = await fetchCompiledSecrets(provider, envName, runtimeFolders, fetchMode);
    const deployOnlySecrets = deployOnlyFolders.length
        ? await fetchCompiledSecrets(provider, envName, deployOnlyFolders, fetchMode)
        : {};
    const optionalKeys = resolveOptionalKeys(manifest.config, envName);
    const aliased = applyAliases({ ...runtimeSecrets, ...deployOnlySecrets }, allFolders);
    // The fetch already selected the declared keys per folder; this only enforces
    // that every declared canonical key was produced. A declared-but-absent
    // optional key gets a single ::notice:: from enforceKnownKeys.
    const declaredKeys = [
        ...new Set(allFolders.flatMap((f) => f.keys.map((k) => k.key))),
    ];
    const merged = selectEmittedSecrets(aliased, declaredKeys, optionalKeys);
    appendSecretsToGithubEnv(githubEnvPath, merged);
    // Advertise CANONICAL (pre-alias) key names. Alias targets (e.g.
    // NEXT_PUBLIC_*) are build-tool copies, not the names a server runtime reads,
    // so they are intentionally not advertised — they still land in the job env
    // via `merged` for build steps that need them. Filter to keys actually in
    // `merged` so we never advertise a name not in the job env (e.g. an absent
    // optional key).
    const emitted = (keys) => keys.filter((k) => merged[k] !== undefined);
    runAdvertiseKeysHooks(githubEnvPath, config.hooks?.advertiseKeys, {
        runtimeKeys: emitted(Object.keys(runtimeSecrets)),
        allKeys: emitted(Object.keys({ ...runtimeSecrets, ...deployOnlySecrets })),
    });
}
//# sourceMappingURL=export-gha.js.map