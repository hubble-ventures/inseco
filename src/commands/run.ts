import { spawnSync } from "node:child_process";
import { loadConfig } from "../config.js";
import { normalizeEnvSlug } from "../env-slug.js";
import { normalizeFolderPath, resolveCompiledFolders } from "../manifest.js";
import { discoverManifests } from "../registry.js";

export type RunOptions = {
  packageId: string;
  profile?: string;
  env: string;
  command: string[];
  cwd?: string;
};

export async function runExec(options: RunOptions): Promise<number> {
  const config = await loadConfig(options.cwd);
  const repoRoot = config.repoRoot;
  const envName = normalizeEnvSlug(process.env.INFISICAL_ENV ?? options.env);

  const manifests = discoverManifests(config);
  const manifest = manifests.find((m) => m.id === options.packageId);
  if (!manifest) {
    throw new Error(`Unknown package id: ${options.packageId}`);
  }

  if (process.env.INFISICAL_DISABLE === "1") {
    const result = spawnSync(options.command[0], options.command.slice(1), {
      stdio: "inherit",
      cwd: repoRoot,
    });
    return result.status ?? 1;
  }

  const folders = resolveCompiledFolders(manifest.config, options.profile);
  const pathFlags = folders.flatMap((f) => [
    "--path",
    normalizeFolderPath(f.path),
  ]);

  const result = spawnSync(
    "infisical",
    ["run", `--env=${envName}`, ...pathFlags, "--", ...options.command],
    { stdio: "inherit", cwd: repoRoot }
  );

  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}
