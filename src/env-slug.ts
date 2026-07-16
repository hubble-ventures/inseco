/** Normalize Infisical environment slugs. */
export function normalizeEnvSlug(env: string): string {
  if (env === "prod") return "production";
  return env;
}
