import { normalizeEnvSlug } from "../env-slug.js";
import { normalizeFolderPath } from "../manifest.js";
import type { SecretsProvider } from "./types.js";

export type RemoteProviderOptions = {
  domain?: string;
  projectSlug: string;
  /**
   * Infisical machine-identity id bound to a GitHub OIDC auth method. This is
   * the only CI auth lane infisicml supports — there is no client-id/secret
   * fallback.
   */
  identityId: string;
  /**
   * OIDC audience — must match one of the Infisical machine identity's bound
   * audiences. There is no universal default, so it is only appended to the
   * GitHub token request when set. Configure it per repo (see InfisicmlConfig.auth).
   */
  oidcAudience?: string;
  fetchFn?: typeof fetch;
  getOidcJwt?: () => Promise<string>;
};

type SecretRecord = { secretKey?: string; secretValue?: string };

/**
 * CI-time provider: talks to the Infisical REST API directly using a machine
 * identity via GitHub OIDC. No `infisical` CLI, and no long-lived client
 * secret, in the runner — the runner's short-lived OIDC token is exchanged for
 * an Infisical access token.
 */
export class RemoteProvider implements SecretsProvider {
  private readonly domain: string;
  private readonly projectSlug: string;
  private readonly identityId: string;
  private readonly oidcAudience?: string;
  private readonly fetchFn: typeof fetch;
  private readonly getOidcJwt?: () => Promise<string>;
  private token?: string;

  constructor(options: RemoteProviderOptions) {
    this.domain = options.domain ?? "https://app.infisical.com";
    this.projectSlug = options.projectSlug;
    this.identityId = options.identityId;
    this.oidcAudience = options.oidcAudience;
    this.fetchFn = options.fetchFn ?? fetch;
    this.getOidcJwt = options.getOidcJwt;
  }

  async exportFolder(
    envName: string,
    folder: string
  ): Promise<Record<string, string>> {
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

    const data = (await resp.json()) as {
      message?: string;
      secrets?: SecretRecord[];
      imports?: { secrets?: SecretRecord[] }[];
    };

    if (data.message) {
      throw new Error(
        `Infisical error for path ${secretPath}: ${data.message}`
      );
    }

    const merged: Record<string, string> = {};
    for (const imp of data.imports ?? []) {
      for (const s of imp.secrets ?? []) {
        if (s.secretKey) merged[s.secretKey] = s.secretValue ?? "";
      }
    }
    for (const s of data.secrets ?? []) {
      if (s.secretKey) merged[s.secretKey] = s.secretValue ?? "";
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
  async exportKeys(
    envName: string,
    folder: string,
    keys: string[]
  ): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    const envSlug = normalizeEnvSlug(envName);
    const secretPath = normalizeFolderPath(folder);
    const out: Record<string, string> = {};

    for (const key of keys) {
      const url = new URL(
        `${this.domain}/api/v3/secrets/raw/${encodeURIComponent(key)}`
      );
      url.searchParams.set("secretPath", secretPath);
      url.searchParams.set("environment", envSlug);
      url.searchParams.set("workspaceSlug", this.projectSlug);
      url.searchParams.set("include_imports", "true");
      url.searchParams.set("expandSecretReferences", "true");

      const resp = await this.fetchWithRetry(
        url.toString(),
        { headers: { Authorization: `Bearer ${token}` } },
        5,
        true // allow404: a missing key is a non-fatal miss, not an error
      );
      if (resp.status === 404) continue;

      const data = (await resp.json()) as {
        message?: string;
        secret?: SecretRecord;
      };
      if (data.message) {
        throw new Error(`Infisical error for key ${key}: ${data.message}`);
      }
      if (data.secret?.secretKey) {
        out[data.secret.secretKey] = data.secret.secretValue ?? "";
      }
    }

    return out;
  }

  private async getAccessToken(): Promise<string> {
    if (this.token) return this.token;

    if (!this.identityId) {
      throw new Error("INFISICAL_IDENTITY_ID required for OIDC auth");
    }

    const jwt = this.getOidcJwt
      ? await this.getOidcJwt()
      : await this.fetchOidcJwtFromEnv();
    const body = new URLSearchParams({ identityId: this.identityId, jwt });
    const resp = await this.fetchWithRetry(
      `${this.domain}/api/v1/auth/oidc-auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    const data = (await resp.json()) as { accessToken?: string };
    this.token = data.accessToken ?? "";

    if (!this.token) {
      throw new Error("Infisical OIDC auth failed: empty access token");
    }
    return this.token;
  }

  private async fetchOidcJwtFromEnv(): Promise<string> {
    const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestUrl || !requestToken) {
      throw new Error(
        "OIDC auth requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN"
      );
    }
    const url = this.oidcAudience
      ? `${requestUrl}&audience=${encodeURIComponent(this.oidcAudience)}`
      : requestUrl;
    const resp = await this.fetchWithRetry(url, {
      headers: { Authorization: `bearer ${requestToken}` },
    });
    const data = (await resp.json()) as { value?: string };
    if (!data.value) {
      throw new Error("OIDC JWT request returned empty value");
    }
    return data.value;
  }

  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
    maxAttempts = 5,
    // When set, a 404 short-circuits: it's returned as-is (not retried, not
    // thrown) so a per-key read can treat "key not in this folder" as a normal,
    // non-fatal miss rather than an error.
    allow404 = false
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const resp = await this.fetchFn(url, {
          ...init,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (allow404 && resp.status === 404) return resp;
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${text}`);
        }
        return resp;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 5000));
        }
      }
    }
    throw lastError;
  }
}
