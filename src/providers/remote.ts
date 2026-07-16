import { normalizeEnvSlug } from "../env-slug.js";
import { normalizeFolderPath } from "../manifest.js";
import type { SecretsProvider } from "./types.js";

export type RemoteProviderOptions = {
  domain?: string;
  projectSlug: string;
  /**
   * Infisical machine-identity id bound to a GitHub OIDC auth method. This is
   * the only CI auth lane inseco supports — there is no client-id/secret
   * fallback.
   */
  identityId: string;
  /**
   * OIDC audience — must match one of the Infisical machine identity's bound
   * audiences. There is no universal default, so it is only appended to the
   * GitHub token request when set. Configure it per repo (see InsecoConfig.auth).
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
    maxAttempts = 5
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
