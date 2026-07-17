import { normalizeEnvSlug } from "../env-slug.js";
import { normalizeFolderPath } from "../manifest.js";
/**
 * CI-time provider: talks to the Infisical REST API directly using a machine
 * identity via GitHub OIDC. No `infisical` CLI, and no long-lived client
 * secret, in the runner — the runner's short-lived OIDC token is exchanged for
 * an Infisical access token.
 */
export class RemoteProvider {
    domain;
    projectSlug;
    identityId;
    oidcAudience;
    fetchFn;
    getOidcJwt;
    token;
    constructor(options) {
        this.domain = options.domain ?? "https://app.infisical.com";
        this.projectSlug = options.projectSlug;
        this.identityId = options.identityId;
        this.oidcAudience = options.oidcAudience;
        this.fetchFn = options.fetchFn ?? fetch;
        this.getOidcJwt = options.getOidcJwt;
    }
    async exportFolder(envName, folder) {
        const token = await this.getAccessToken();
        const envSlug = normalizeEnvSlug(envName);
        const secretPath = normalizeFolderPath(folder);
        const url = new URL(`${this.domain}/api/v3/secrets/raw`);
        url.searchParams.set("secretPath", secretPath);
        url.searchParams.set("environment", envSlug);
        url.searchParams.set("workspaceSlug", this.projectSlug);
        url.searchParams.set("include_imports", "true");
        url.searchParams.set("recursive", "false");
        url.searchParams.set("expandSecretReferences", "true");
        const resp = await this.fetchWithRetry(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await resp.json());
        if (data.message) {
            throw new Error(`Infisical error for path ${secretPath}: ${data.message}`);
        }
        const merged = {};
        for (const imp of data.imports ?? []) {
            for (const s of imp.secrets ?? []) {
                if (s.secretKey)
                    merged[s.secretKey] = s.secretValue ?? "";
            }
        }
        for (const s of data.secrets ?? []) {
            if (s.secretKey)
                merged[s.secretKey] = s.secretValue ?? "";
        }
        return merged;
    }
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
    async exportKeys(envName, folder, keys) {
        const token = await this.getAccessToken();
        const envSlug = normalizeEnvSlug(envName);
        const secretPath = normalizeFolderPath(folder);
        const out = {};
        for (const key of keys) {
            const url = new URL(`${this.domain}/api/v3/secrets/raw/${encodeURIComponent(key)}`);
            url.searchParams.set("secretPath", secretPath);
            url.searchParams.set("environment", envSlug);
            url.searchParams.set("workspaceSlug", this.projectSlug);
            url.searchParams.set("include_imports", "true");
            url.searchParams.set("expandSecretReferences", "true");
            const resp = await this.fetchWithRetry(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, 5, true // allow404: a missing key is a non-fatal miss, not an error
            );
            if (resp.status === 404)
                continue;
            const data = (await resp.json());
            if (data.message) {
                throw new Error(`Infisical error for key ${key}: ${data.message}`);
            }
            if (data.secret?.secretKey) {
                out[data.secret.secretKey] = data.secret.secretValue ?? "";
            }
        }
        return out;
    }
    async getAccessToken() {
        if (this.token)
            return this.token;
        if (!this.identityId) {
            throw new Error("INFISICAL_IDENTITY_ID required for OIDC auth");
        }
        const jwt = this.getOidcJwt
            ? await this.getOidcJwt()
            : await this.fetchOidcJwtFromEnv();
        const body = new URLSearchParams({ identityId: this.identityId, jwt });
        const resp = await this.fetchWithRetry(`${this.domain}/api/v1/auth/oidc-auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        const data = (await resp.json());
        this.token = data.accessToken ?? "";
        if (!this.token) {
            throw new Error("Infisical OIDC auth failed: empty access token");
        }
        return this.token;
    }
    async fetchOidcJwtFromEnv() {
        const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
        const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
        if (!requestUrl || !requestToken) {
            throw new Error("OIDC auth requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN");
        }
        const url = this.oidcAudience
            ? `${requestUrl}&audience=${encodeURIComponent(this.oidcAudience)}`
            : requestUrl;
        const resp = await this.fetchWithRetry(url, {
            headers: { Authorization: `bearer ${requestToken}` },
        });
        const data = (await resp.json());
        if (!data.value) {
            throw new Error("OIDC JWT request returned empty value");
        }
        return data.value;
    }
    async fetchWithRetry(url, init, maxAttempts = 5, 
    // When set, a 404 short-circuits: it's returned as-is (not retried, not
    // thrown) so a per-key read can treat "key not in this folder" as a normal,
    // non-fatal miss rather than an error.
    allow404 = false) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 120_000);
                const resp = await this.fetchFn(url, {
                    ...init,
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (allow404 && resp.status === 404)
                    return resp;
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(`HTTP ${resp.status}: ${text}`);
                }
                return resp;
            }
            catch (err) {
                lastError = err;
                if (attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, attempt * 5000));
                }
            }
        }
        throw lastError;
    }
}
//# sourceMappingURL=remote.js.map