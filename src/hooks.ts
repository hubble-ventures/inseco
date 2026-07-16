import type { AdvertiseKeysHook } from "./config.js";
import { appendPlainToGithubEnv } from "./github-env.js";

export type AdvertiseInput = {
  /** Canonical key names from the manifest's base (runtime) paths. */
  runtimeKeys: string[];
  /** Canonical key names across all resolved (profile) paths. */
  allKeys: string[];
};

export function keysForScope(
  hook: AdvertiseKeysHook,
  input: AdvertiseInput
): string[] {
  const keys = hook.scope === "all" ? input.allKeys : input.runtimeKeys;
  return [...keys].sort();
}

/**
 * Write each configured `advertiseKeys` hook's key list to GITHUB_ENV as a
 * plain (unmasked, non-secret) comma-separated var. Key NAMES only — values are
 * never advertised. A deploy step forwards exactly these keys by value from the
 * job env, so `secrets.json` stays the single source of truth for what lands on
 * the app (no hand-maintained allowlist in the workflow).
 */
export function runAdvertiseKeysHooks(
  githubEnvPath: string,
  hooks: AdvertiseKeysHook[] | undefined,
  input: AdvertiseInput
): void {
  for (const hook of hooks ?? []) {
    const keys = keysForScope(hook, input);
    appendPlainToGithubEnv(githubEnvPath, hook.envVar, keys.join(","));
  }
}
