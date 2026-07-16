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
