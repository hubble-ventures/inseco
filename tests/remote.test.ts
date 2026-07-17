import { describe, expect, it } from "vitest";
import { RemoteProvider } from "../src/providers/remote.js";

/** Route mock fetch by URL substring; returns 404 for anything unmatched. */
function mockFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("RemoteProvider — GitHub OIDC only", () => {
  it("exchanges an OIDC JWT for an access token and returns secrets", async () => {
    const calls: string[] = [];
    const provider = new RemoteProvider({
      projectSlug: "proj",
      identityId: "id-123",
      getOidcJwt: async () => "jwt-token",
      fetchFn: ((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        return mockFetch({
          "oidc-auth/login": { accessToken: "access-token" },
          "secrets/raw": {
            secrets: [{ secretKey: "CLERK_SECRET_KEY", secretValue: "sk_test" }],
          },
        })(input, init);
      }) as unknown as typeof fetch,
    });

    const secrets = await provider.exportFolder("production", "clerk");
    expect(secrets).toEqual({ CLERK_SECRET_KEY: "sk_test" });
    // Auth went through the OIDC login endpoint, never universal-auth.
    expect(calls.some((u) => u.includes("oidc-auth/login"))).toBe(true);
    expect(calls.some((u) => u.includes("universal-auth"))).toBe(false);
  });

  it("throws when no identity id is provided (no client-id/secret fallback)", async () => {
    const provider = new RemoteProvider({
      projectSlug: "proj",
      identityId: "",
      getOidcJwt: async () => "jwt",
      fetchFn: mockFetch({}),
    });
    await expect(provider.exportFolder("production", "clerk")).rejects.toThrow(
      /OIDC/
    );
  });
});

describe("RemoteProvider.exportKeys — per-key least-privilege read", () => {
  /** Serve named single-secret reads; anything else 404s (key not in folder). */
  function keyFetch(
    calls: string[],
    present: Record<string, string>
  ): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.includes("oidc-auth/login")) {
        return new Response(JSON.stringify({ accessToken: "tok" }), {
          status: 200,
        });
      }
      for (const [key, value] of Object.entries(present)) {
        if (url.includes(`/secrets/raw/${key}?`)) {
          return new Response(
            JSON.stringify({ secret: { secretKey: key, secretValue: value } }),
            { status: 200 }
          );
        }
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
  }

  it("requests only the named keys and skips 404 misses", async () => {
    const calls: string[] = [];
    const provider = new RemoteProvider({
      projectSlug: "proj",
      identityId: "id-123",
      getOidcJwt: async () => "jwt",
      fetchFn: keyFetch(calls, { STRIPE_PUBLISHABLE_KEY: "pk_live" }),
    });

    const secrets = await provider.exportKeys("production", "stripe", [
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SECRET_KEY", // absent in folder → 404 → skipped, not thrown
    ]);

    expect(secrets).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk_live" });
    // Never requested a whole-folder read, only per-key raw endpoints.
    expect(calls.some((u) => u.includes("/secrets/raw/STRIPE_PUBLISHABLE_KEY")))
      .toBe(true);
    // Imports are followed (matching folder mode) so an import-surfaced key is
    // still resolved; the single-name endpoint returns only that one secret.
    expect(calls.some((u) => u.includes("include_imports=true"))).toBe(true);
    expect(
      calls.some((u) => u.includes("secrets/raw?") /* folder list form */)
    ).toBe(false);
  });

  it("reuses one access token across all per-key requests", async () => {
    const calls: string[] = [];
    const provider = new RemoteProvider({
      projectSlug: "proj",
      identityId: "id-123",
      getOidcJwt: async () => "jwt",
      fetchFn: keyFetch(calls, { A: "1", B: "2" }),
    });
    await provider.exportKeys("production", "vendor", ["A", "B"]);
    expect(calls.filter((u) => u.includes("oidc-auth/login"))).toHaveLength(1);
  });
});
