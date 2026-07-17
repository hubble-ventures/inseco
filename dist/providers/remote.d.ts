import type { SecretsProvider } from "./types.js";
export type RemoteProviderOptions = {
    domain?: string;
    projectSlug: string;
    /**
     * Infisical machine-identity id bound to a GitHub OIDC auth method. This is
     * the only CI auth lane infiscml supports — there is no client-id/secret
     * fallback.
     */
    identityId: string;
    /**
     * OIDC audience — must match one of the Infisical machine identity's bound
     * audiences. There is no universal default, so it is only appended to the
     * GitHub token request when set. Configure it per repo (see InfiscmlConfig.auth).
     */
    oidcAudience?: string;
    fetchFn?: typeof fetch;
    getOidcJwt?: () => Promise<string>;
};
/**
 * CI-time provider: talks to the Infisical REST API directly using a machine
 * identity via GitHub OIDC. No `infisical` CLI, and no long-lived client
 * secret, in the runner — the runner's short-lived OIDC token is exchanged for
 * an Infisical access token.
 */
export declare class RemoteProvider implements SecretsProvider {
    private readonly domain;
    private readonly projectSlug;
    private readonly identityId;
    private readonly oidcAudience?;
    private readonly fetchFn;
    private readonly getOidcJwt?;
    private token?;
    constructor(options: RemoteProviderOptions);
    exportFolder(envName: string, folder: string): Promise<Record<string, string>>;
    /**
     * Fetch only the named keys from a folder via the single-secret raw endpoint
     * (`GET /api/v3/secrets/raw/{name}`), so the vault transmits nothing beyond
     * the requested keys — wire-level least privilege. `include_imports=true`
     * matches {@link exportFolder}, so a key surfaced into this folder via an
     * Infisical import is still resolved (the single-name endpoint returns only
     * that one secret, so following imports doesn't widen the read). A 404 means
     * the key isn't reachable from this folder and is skipped; the caller merges
     * across folders and enforces genuine absence. The access token is fetched
     * once and reused across keys.
     */
    exportKeys(envName: string, folder: string, keys: string[]): Promise<Record<string, string>>;
    private getAccessToken;
    private fetchOidcJwtFromEnv;
    private fetchWithRetry;
}
//# sourceMappingURL=remote.d.ts.map