import { loadConfig } from "../config.js";
import { normalizeFolderPath, resolvePaths } from "../manifest.js";
import { discoverManifests } from "../registry.js";

export type PathsOptions = {
  packageId: string;
  profile?: string;
  comma: boolean;
  cwd?: string;
};

export async function runPaths(options: PathsOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  const manifests = discoverManifests(config);
  const manifest = manifests.find((m) => m.id === options.packageId);
  if (!manifest) {
    throw new Error(`Unknown package id: ${options.packageId}`);
  }

  const paths = resolvePaths(manifest.config, options.profile);
  const normalized = paths.map((p) => normalizeFolderPath(p));

  if (options.comma) {
    console.log(normalized.map((p) => p.replace(/^\//, "")).join(","));
  } else {
    console.log(normalized.map((p) => `--path=${p}`).join(" "));
  }
}
