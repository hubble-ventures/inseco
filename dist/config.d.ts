/**
 * How Infiscml discovers per-package `secrets.json` manifests. Discovery is
 * driven entirely by config, so no repo layout is baked into the tool.
 */
export type DiscoveryConfig = {
    /**
     * Parent directories scanned one level deep. Any immediate child directory
     * containing a `secrets.json` becomes a package whose id is the child dir
     * name (e.g. `roots: ["nextjs-apps", "vite-apps"]`).
     */
    roots?: string[];
    /** Explicit packages with custom ids (e.g. `{ id: "postgres", dir: "infra/postgres" }`). */
    packages?: {
        id: string;
        dir: string;
    }[];
};
/**
 * Advertise a subset of a package's secret KEY NAMES (never values) to
 * GITHUB_ENV as a plain, comma-separated var. A deploy step reads it and
 * forwards exactly those keys (e.g. `flyctl secrets import`, `gcloud`,
 * `wrangler secret`), so `secrets.json` stays the source of truth for what a
 * deploy forwards — no hand-maintained allowlist in the workflow.
 */
export type AdvertiseKeysHook = {
    /** Env var name to write the comma-separated key list to. */
    envVar: string;
    /**
     * `runtime` (default): only keys from the manifest's base `paths` — the app's
     *   runtime secrets, excluding profile-only deploy credentials.
     * `all`: every canonical key across the resolved (profile) paths.
     */
    scope?: "runtime" | "all";
};
export type InfiscmlConfig = {
    /** Infisical project id for the local CLI provider. */
    projectId?: string;
    /** dotenv file (relative to repo root) providing INFISICAL_PROJECT_ID. */
    projectIdEnvFile?: string;
    /** Infisical API domain (self-hosted). Defaults to https://app.infisical.com. */
    infisicalDomain?: string;
    discovery: DiscoveryConfig;
    auth?: {
        /** OIDC audience bound to the machine identity (CI). */
        oidcAudience?: string;
    };
    hooks?: {
        advertiseKeys?: AdvertiseKeysHook[];
    };
};
export type ResolvedConfig = InfiscmlConfig & {
    repoRoot: string;
    projectId: string;
};
/** Identity helper for type-safe `infiscml.config.ts` files. */
export declare function defineConfig(config: InfiscmlConfig): InfiscmlConfig;
export declare function loadConfig(cwd?: string): Promise<ResolvedConfig>;
//# sourceMappingURL=config.d.ts.map