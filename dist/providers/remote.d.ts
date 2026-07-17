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
    private getAccessToken;
    private fetchOidcJwtFromEnv;
    private fetchWithRetry;
}
//# sourceMappingURL=remote.d.ts.map