/** Normalize Infisical environment slugs. */
export function normalizeEnvSlug(env) {
    if (env === "prod")
        return "production";
    return env;
}
//# sourceMappingURL=env-slug.js.map