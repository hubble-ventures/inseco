import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDotenv } from "../src/dotenv.js";
import type { PackageManifest } from "../src/registry.js";
import type { SecretsProvider } from "../src/providers/types.js";
import { pullManifest } from "../src/pull.js";

/** Fake provider: returns a fixed value per secret key, regardless of folder. */
function fakeProvider(secrets: Record<string, string>): SecretsProvider {
  return {
    async exportFolder() {
      return { ...secrets };
    },
    async exportKeys(_env, _folder, keys) {
      const out: Record<string, string> = {};
      for (const key of keys) {
        if (key in secrets) out[key] = secrets[key];
      }
      return out;
    },
  };
}

/**
 * Recording provider for `fetch: "keys"` assertions: like {@link fakeProvider}
 * but tracks which keys were requested and whether a whole-folder read happened.
 */
function recordingProvider(secrets: Record<string, string>) {
  const requestedKeys: string[] = [];
  let folderReads = 0;
  const provider: SecretsProvider = {
    async exportFolder() {
      folderReads += 1;
      return { ...secrets };
    },
    async exportKeys(_env, _folder, keys) {
      requestedKeys.push(...keys);
      const out: Record<string, string> = {};
      for (const key of keys) {
        if (key in secrets) out[key] = secrets[key];
      }
      return out;
    },
  };
  return {
    provider,
    requestedKeys,
    get folderReads() {
      return folderReads;
    },
  };
}

describe("pullManifest — output paths + multi-target aliases", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "infisicml-pull-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function manifest(config: PackageManifest["config"]): PackageManifest {
    return { id: "web", dir, config };
  }

  it("writes the default .env.secrets when no output is set", async () => {
    const result = await pullManifest({
      manifest: manifest({ tree: { clerk: { raw: ["CLERK_PUBLISHABLE_KEY"] } } }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ CLERK_PUBLISHABLE_KEY: "pk_live" }),
    });
    expect(result).toBe("pulled");
    expect(existsSync(join(dir, ".env.secrets"))).toBe(true);
  });

  it("writes to a custom per-package output filename", async () => {
    await pullManifest({
      manifest: manifest({
        tree: { clerk: { raw: ["CLERK_PUBLISHABLE_KEY"] } },
        output: ".env.local",
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ CLERK_PUBLISHABLE_KEY: "pk_live" }),
    });

    expect(existsSync(join(dir, ".env.local"))).toBe(true);
    expect(existsSync(join(dir, ".env.secrets"))).toBe(false);

    const parsed = parseDotenv(readFileSync(join(dir, ".env.local"), "utf8"));
    expect(parsed.CLERK_PUBLISHABLE_KEY).toBe("pk_live");
  });

  it("supports `output: .env` (no separators, dotfile) for an app package", async () => {
    await pullManifest({
      manifest: manifest({
        tree: { clerk: { raw: ["CLERK_PUBLISHABLE_KEY"] } },
        output: ".env",
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ CLERK_PUBLISHABLE_KEY: "pk_live" }),
    });
    expect(existsSync(join(dir, ".env"))).toBe(true);
  });

  it("materializes ONE canonical key to SEVERAL prefixed aliases in one file", async () => {
    // GOOGLE_MAPS_API_KEY -> both EXPO_PUBLIC_* and VITE_* in a single output.
    await pullManifest({
      manifest: manifest({
        tree: {
          google: {
            aliased: {
              GOOGLE_MAPS_API_KEY: [
                "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
                "VITE_GOOGLE_MAPS_API_KEY",
              ],
            },
          },
        },
        output: ".env",
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ GOOGLE_MAPS_API_KEY: "AIza-secret" }),
    });

    const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
    expect(parsed.GOOGLE_MAPS_API_KEY).toBe("AIza-secret");
    expect(parsed.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).toBe("AIza-secret");
    expect(parsed.VITE_GOOGLE_MAPS_API_KEY).toBe("AIza-secret");
  });

  it("emits only the declared keys from a multi-key folder", async () => {
    // The /stripe folder holds a server secret and a publishable key; a client
    // package declares only the publishable key (aliased) — the server secret
    // is undeclared and must never reach the client build's env.
    await pullManifest({
      manifest: manifest({
        tree: {
          stripe: {
            aliased: {
              STRIPE_PUBLISHABLE_KEY: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
            },
          },
        },
        output: ".env",
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({
        STRIPE_SECRET_KEY: "sk_live",
        STRIPE_PUBLISHABLE_KEY: "pk_live",
      }),
    });

    const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
    // The declared canonical key AND its alias target both emit; the undeclared
    // server secret does not.
    expect(parsed).toEqual({
      STRIPE_PUBLISHABLE_KEY: "pk_live",
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live",
    });
    expect(parsed.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("fails the pull when the tree declares a key no folder produced", async () => {
    await expect(
      pullManifest({
        manifest: manifest({
          tree: { stripe: { raw: ["NONEXISTENT_KEY"] } },
          output: ".env",
        }),
        repoRoot: dir,
        envName: "development",
        provider: fakeProvider({ STRIPE_SECRET_KEY: "sk_live" }),
      })
    ).rejects.toThrow(/NONEXISTENT_KEY/);
  });

  it("allows a declared key to be absent when it is optional for the env", async () => {
    // STRIPE_WEBHOOK_SECRET is declared but not present; optionalKeys downgrades
    // the miss to a notice rather than failing the pull.
    const result = await pullManifest({
      manifest: manifest({
        tree: { stripe: { raw: ["STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"] } },
        output: ".env",
        environments: { development: { optionalKeys: ["STRIPE_WEBHOOK_SECRET"] } },
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ STRIPE_PUBLISHABLE_KEY: "pk_live" }),
    });
    expect(result).toBe("pulled");
    const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
    expect(parsed).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk_live" });
  });

  describe("fetch: keys (wire-level least privilege)", () => {
    it("requests only the declared keys and never reads whole folders", async () => {
      const rec = recordingProvider({
        STRIPE_SECRET_KEY: "sk_live",
        STRIPE_PUBLISHABLE_KEY: "pk_live",
      });
      await pullManifest({
        manifest: manifest({
          tree: { stripe: { raw: ["STRIPE_PUBLISHABLE_KEY"] } },
          output: ".env",
          fetch: "keys",
        }),
        repoRoot: dir,
        envName: "development",
        provider: rec.provider,
      });

      const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
      expect(parsed).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk_live" });
      // The server key was never requested from the vault, not merely filtered.
      expect(rec.requestedKeys).toEqual(["STRIPE_PUBLISHABLE_KEY"]);
      expect(rec.requestedKeys).not.toContain("STRIPE_SECRET_KEY");
      expect(rec.folderReads).toBe(0);
    });

    it("fetches the canonical aliased source (the real vault key)", async () => {
      const rec = recordingProvider({
        STRIPE_PUBLISHABLE_KEY: "pk_live",
        STRIPE_SECRET_KEY: "sk_live",
      });
      await pullManifest({
        manifest: manifest({
          tree: {
            stripe: {
              aliased: {
                STRIPE_PUBLISHABLE_KEY: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
              },
            },
          },
          output: ".env",
          fetch: "keys",
        }),
        repoRoot: dir,
        envName: "development",
        provider: rec.provider,
      });

      const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
      expect(parsed).toEqual({
        STRIPE_PUBLISHABLE_KEY: "pk_live",
        EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live",
      });
      // The aliased map key IS the canonical vault key — requested directly.
      expect(rec.requestedKeys).toEqual(["STRIPE_PUBLISHABLE_KEY"]);
      expect(rec.requestedKeys).not.toContain("STRIPE_SECRET_KEY");
    });

    it("still fails when a declared key exists in no folder", async () => {
      await expect(
        pullManifest({
          manifest: manifest({
            tree: { stripe: { raw: ["NONEXISTENT_KEY"] } },
            output: ".env",
            fetch: "keys",
          }),
          repoRoot: dir,
          envName: "development",
          provider: fakeProvider({ STRIPE_SECRET_KEY: "sk_live" }),
        })
      ).rejects.toThrow(/NONEXISTENT_KEY/);
    });
  });

  describe("cross-folder provenance (same key name in two folders)", () => {
    /** Provider that returns a distinct secret set per folder path. */
    function folderAwareProvider(
      byFolder: Record<string, Record<string, string>>
    ): SecretsProvider {
      return {
        async exportFolder(_env, folder) {
          return { ...(byFolder[folder] ?? {}) };
        },
        async exportKeys(_env, folder, keys) {
          const src = byFolder[folder] ?? {};
          const out: Record<string, string> = {};
          for (const k of keys) if (k in src) out[k] = src[k];
          return out;
        },
      };
    }

    it("routes each folder's TOKEN value to its OWN alias target", async () => {
      await pullManifest({
        manifest: manifest({
          tree: {
            a: { aliased: { TOKEN: "A_TOKEN" } },
            b: { aliased: { TOKEN: "B_TOKEN" } },
          },
          output: ".env",
        }),
        repoRoot: dir,
        envName: "development",
        provider: folderAwareProvider({
          a: { TOKEN: "a-value" },
          b: { TOKEN: "b-value" },
        }),
      });

      const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
      // Each alias target carries its own folder's value (not one shared TOKEN).
      expect(parsed.A_TOKEN).toBe("a-value");
      expect(parsed.B_TOKEN).toBe("b-value");
    });

    it("fails when a key is missing from ONE declaring folder even if another has it", async () => {
      await expect(
        pullManifest({
          manifest: manifest({
            tree: { a: { raw: ["TOKEN"] }, b: { raw: ["TOKEN"] } },
            output: ".env",
          }),
          repoRoot: dir,
          envName: "development",
          provider: folderAwareProvider({ a: {}, b: { TOKEN: "b-value" } }),
        })
      ).rejects.toThrow(/TOKEN/);
    });
  });
});
