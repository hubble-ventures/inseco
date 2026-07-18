import { appendPlainToGithubEnv } from "./github-env.js";
export function keysForScope(hook, input) {
    const keys = hook.scope === "all" ? input.allKeys : input.runtimeKeys;
    return [...keys].sort();
}
/**
 * Write each configured `advertiseKeys` hook's key list to GITHUB_ENV as a
 * plain (unmasked, non-secret) comma-separated var. Key NAMES only — values are
 * never advertised. A deploy step forwards exactly these keys by value from the
 * job env, so the secrets manifest stays the single source of truth for what
 * lands on the app (no hand-maintained allowlist in the workflow).
 */
export function runAdvertiseKeysHooks(githubEnvPath, hooks, input) {
    for (const hook of hooks ?? []) {
        const keys = keysForScope(hook, input);
        appendPlainToGithubEnv(githubEnvPath, hook.envVar, keys.join(","));
    }
}
//# sourceMappingURL=hooks.js.map