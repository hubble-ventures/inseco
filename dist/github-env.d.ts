export declare function appendSecretToGithubEnv(githubEnvPath: string, key: string, value: string): void;
export declare function appendSecretsToGithubEnv(githubEnvPath: string, secrets: Record<string, string>): void;
/**
 * Append a NON-secret env var (no `::add-mask::`) to GITHUB_ENV. Use for
 * metadata like a comma-separated list of secret key names — the names are not
 * sensitive, and masking them would garble unrelated log output. The value must
 * be a single line (secret key names always are).
 */
export declare function appendPlainToGithubEnv(githubEnvPath: string, key: string, value: string): void;
//# sourceMappingURL=github-env.d.ts.map