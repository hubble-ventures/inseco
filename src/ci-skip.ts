import type { SecretsManifest } from "./manifest.js";
import type { SecretsProvider } from "./providers/types.js";

export type { SecretsProvider };

export function mergeFolderSecrets(
  chunks: Record<string, string>[]
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const chunk of chunks) {
    Object.assign(merged, chunk);
  }
  return merged;
}

export async function fetchSecretsForPaths(
  provider: SecretsProvider,
  envName: string,
  paths: string[]
): Promise<Record<string, string>> {
  const chunks: Record<string, string>[] = [];
  for (const folder of paths) {
    chunks.push(await provider.exportFolder(envName, folder));
  }
  return mergeFolderSecrets(chunks);
}

export function isCi(): boolean {
  const ci = process.env.CI;
  return ci === "true" || ci === "1";
}

export function shouldSkipInfisicalPull(
  manifest: SecretsManifest,
  force: boolean
): boolean {
  if (force) return false;
  if (!isCi()) return false;

  const ci = manifest.ci;
  if (!ci) return false;

  if (ci.stubInCi) return true;

  const keys = ci.skipWhenEnv ?? [];
  if (keys.length === 0) return false;

  return keys.every((key) => {
    const value = process.env[key];
    return value !== undefined && value !== "";
  });
}

export function keysForCiStub(manifest: SecretsManifest): string[] {
  return manifest.ci?.skipWhenEnv ?? [];
}
