import { applyAliases } from "../aliases.js";
import { fetchManifestSecrets } from "../ci-skip.js";
import { loadConfig } from "../config.js";
import { normalizeEnvSlug } from "../env-slug.js";
import { appendSecretsToGithubEnv } from "../github-env.js";
import { runAdvertiseKeysHooks } from "../hooks.js";
import { selectEmittedSecrets } from "../include.js";
import {
  normalizeFolderPath,
  resolveInclude,
  resolvePaths,
} from "../manifest.js";
import {
  logMissingOptionalKeys,
  resolveOptionalKeys,
} from "../optional-keys.js";
import { RemoteProvider } from "../providers/remote.js";
import { discoverManifests } from "../registry.js";

export type ExportGhaOptions = {
  packageId: string;
  env: string;
  profile?: string;
  cwd?: string;
  githubEnvPath?: string;
  projectSlug?: string;
  identityId?: string;
};

export async function runExportGha(options: ExportGhaOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  const envName = normalizeEnvSlug(
    process.env.INFISICAL_ENV_SLUG ?? options.env
  );
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

  // Base `paths` are the app's runtime secrets; a profile (e.g. `deploy`) may
  // replace them with a superset that also carries deploy-time credentials.
  // Split the two so we advertise only runtime keys for deploy forwarding.
  const allPaths = resolvePaths(manifest.config, options.profile);
  const basePaths = manifest.config.paths;
  const runtimePaths = basePaths.filter((p) => allPaths.includes(p));
  const deployOnlyPaths = allPaths.filter((p) => !runtimePaths.includes(p));

  const identityId = options.identityId ?? process.env.INFISICAL_IDENTITY_ID;
  if (!identityId) {
    throw new Error(
      "INFISICAL_IDENTITY_ID required — infisicml CI auth is GitHub OIDC only (no client-id/secret fallback). Set `permissions: id-token: write` on the job."
    );
  }

  const provider = new RemoteProvider({
    domain: config.infisicalDomain,
    projectSlug,
    identityId,
    oidcAudience:
      process.env.INFISICAL_OIDC_AUDIENCE ?? config.auth?.oidcAudience,
  });

  for (const folder of allPaths) {
    console.log(
      `Loading Infisical path ${normalizeFolderPath(folder)} (${envName})`
    );
  }

  // Two calls (runtime then deploy-only), reusing the cached access token, so we
  // know which keys are runtime without per-folder provenance through the merge.
  const runtimeSecrets = await fetchManifestSecrets(
    provider,
    envName,
    runtimePaths,
    manifest.config,
    options.profile
  );
  const deployOnlySecrets = deployOnlyPaths.length
    ? await fetchManifestSecrets(
        provider,
        envName,
        deployOnlyPaths,
        manifest.config,
        options.profile
      )
    : {};

  const optionalKeys = resolveOptionalKeys(manifest.config, envName);
  const aliased = applyAliases(
    { ...runtimeSecrets, ...deployOnlySecrets },
    manifest.config
  );
  // Default-deny key selection: emit only the allowlisted keys when `include`
  // is set. Absent = emit all.
  const include = resolveInclude(manifest.config, options.profile);
  // Notice missing optional keys against the pre-include set — a key present in
  // the folders but filtered out by `include` isn't "missing". Skip keys the
  // allowlist governs: those get a single notice from selectEmittedSecrets'
  // unknown-key check, so we don't emit two notices for the same absent key.
  const includeSet = new Set(include ?? []);
  logMissingOptionalKeys(
    aliased,
    optionalKeys.filter((k) => !includeSet.has(k))
  );
  const merged = selectEmittedSecrets(aliased, include, optionalKeys);
  appendSecretsToGithubEnv(githubEnvPath, merged);

  // Advertise CANONICAL (pre-alias) key names. Alias targets (e.g.
  // NEXT_PUBLIC_*) are build-tool copies, not the names a server runtime reads,
  // so they are intentionally not advertised — they still land in the job env
  // via `merged` for build steps that need them. Drop any key `include`
  // filtered out (a no-op when `include` is absent, since every fetched key is
  // then in `merged`) so we never advertise a name not in the job env.
  const emitted = (keys: string[]) => keys.filter((k) => merged[k] !== undefined);
  runAdvertiseKeysHooks(githubEnvPath, config.hooks?.advertiseKeys, {
    runtimeKeys: emitted(Object.keys(runtimeSecrets)),
    allKeys: emitted(Object.keys({ ...runtimeSecrets, ...deployOnlySecrets })),
  });
}
