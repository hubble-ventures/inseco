import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import {
  fetchCompiledFolders,
  keysForCiStub,
  materializeSecrets,
  shouldSkipInfisicalPull,
} from "./ci-skip.js";
import { serializeDotenv } from "./dotenv.js";
import {
  normalizeFolderPath,
  resolveCompiledFolders,
  resolveFetchMode,
  resolveSecretsOutputPath,
} from "./manifest.js";
import { resolveOptionalKeys } from "./optional-keys.js";
import type { SecretsProvider } from "./providers/types.js";
import type { PackageManifest } from "./registry.js";

export type PullResult = "pulled" | "skipped";

export type PullManifestOptions = {
  manifest: PackageManifest;
  repoRoot: string;
  envName: string;
  profile?: string;
  force?: boolean;
  turboMode?: boolean;
  provider: SecretsProvider;
};

export function writeInjectedSecretsStub(
  outputPath: string,
  manifest: PackageManifest,
  keys: string[]
): void {
  const fromEnv: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) fromEnv[key] = value;
  }

  const header = [
    "# Skipped Infisical pull — required build env vars already injected.",
    `# Package: ${manifest.id}`,
    "# Source: process.env (CI / workflow build-env-vars)",
    `# Generated: ${new Date().toISOString()}`,
    "",
  ].join("\n");

  writeFileSync(outputPath, header + serializeDotenv(fromEnv));
}

export async function pullManifest(
  options: PullManifestOptions
): Promise<PullResult> {
  const {
    manifest,
    repoRoot,
    envName,
    profile,
    force = false,
    turboMode = false,
    provider,
  } = options;

  const outputName = manifest.config.output ?? ".env.secrets";
  const outputPath = resolveSecretsOutputPath(manifest.dir, outputName);
  const rel = relative(repoRoot, outputPath);

  if (!turboMode && existsSync(outputPath) && !force) {
    console.log(`⏭️  ${manifest.id}: ${rel} exists (use --force to refresh)`);
    return "skipped";
  }

  if (shouldSkipInfisicalPull(manifest.config, force)) {
    const keys = keysForCiStub(manifest.config);
    writeInjectedSecretsStub(outputPath, manifest, keys);
    console.log(
      `⏭️  ${manifest.id}: skipped Infisical pull (injected env → ${rel})`
    );
    return "skipped";
  }

  const folders = resolveCompiledFolders(manifest.config, profile);
  const fetchMode = resolveFetchMode(manifest.config, profile);
  // Per-folder fetch → per-folder alias + missing-key enforcement → merge, so a
  // key declared in two folders keeps each folder's value/provenance.
  const folderSecrets = await fetchCompiledFolders(
    provider,
    envName,
    folders,
    fetchMode
  );
  const merged = materializeSecrets(
    folderSecrets,
    resolveOptionalKeys(manifest.config, envName)
  );

  // filter(Boolean) drops the optional Profile line when absent. It would also
  // drop a trailing "" sentinel, so append the trailing newline explicitly —
  // otherwise the first secret gets glued onto the "# Generated" line.
  const header = `${[
    "# Pulled from Infisical — do not edit. Refresh: infisicml pull",
    `# Package: ${manifest.id}`,
    `# Environment: ${envName}`,
    profile ? `# Profile: ${profile}` : "",
    `# Paths: ${folders.map((f) => normalizeFolderPath(f.path)).join(", ")}`,
    fetchMode === "keys" ? "# Fetch: keys (per-key least-privilege read)" : "",
    `# Generated: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n")}\n`;

  writeFileSync(outputPath, header + serializeDotenv(merged));
  console.log(
    `✅ ${manifest.id}: wrote ${rel} (${Object.keys(merged).length} vars)`
  );
  return "pulled";
}
