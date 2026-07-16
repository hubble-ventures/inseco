import type { SecretsManifest } from "./manifest.js";

export function resolveOptionalKeys(
  manifest: SecretsManifest,
  envName: string
): string[] {
  return manifest.environments?.[envName]?.optionalKeys ?? [];
}

export function logMissingOptionalKeys(
  merged: Record<string, string>,
  optionalKeys: string[]
): void {
  for (const key of optionalKeys) {
    if (!merged[key]?.trim()) {
      console.log(
        `::notice::Optional secret ${key} not set (allowed for this environment)`
      );
    }
  }
}
