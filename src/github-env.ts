import { appendFileSync } from "node:fs";

export function appendSecretToGithubEnv(
  githubEnvPath: string,
  key: string,
  value: string
): void {
  if (!key) return;

  // Workflow commands must go to stdout — not GITHUB_ENV (see actions/toolkit#1338).
  for (const line of value.split("\n")) {
    if (!line) continue;
    const masked = line.replaceAll("%", "%25");
    process.stdout.write(`::add-mask::${masked}\n`);
  }

  let delim = `INFISICML_${key}_${Date.now()}${process.hrtime.bigint()}`;
  while (value.includes(delim)) {
    delim = `${delim}_`;
  }

  appendFileSync(githubEnvPath, `${key}<<${delim}\n${value}\n${delim}\n`);
}

export function appendSecretsToGithubEnv(
  githubEnvPath: string,
  secrets: Record<string, string>
): void {
  for (const [key, value] of Object.entries(secrets)) {
    appendSecretToGithubEnv(githubEnvPath, key, value);
  }
}

/**
 * Append a NON-secret env var (no `::add-mask::`) to GITHUB_ENV. Use for
 * metadata like a comma-separated list of secret key names — the names are not
 * sensitive, and masking them would garble unrelated log output. The value must
 * be a single line (secret key names always are).
 */
export function appendPlainToGithubEnv(
  githubEnvPath: string,
  key: string,
  value: string
): void {
  if (!key) return;
  if (value.includes("\n")) {
    throw new Error(`Plain GITHUB_ENV value for ${key} must be single-line`);
  }
  appendFileSync(githubEnvPath, `${key}=${value}\n`);
}
