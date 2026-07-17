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
    dir = mkdtempSync(join(tmpdir(), "infiscml-pull-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function manifest(config: PackageManifest["config"]): PackageManifest {
    return { id: "web", dir, config };
  }

  it("writes the default .env.secrets when no output is set", async () => {
    const result = await pullManifest({
      manifest: manifest({ paths: ["clerk"] }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({ CLERK_PUBLISHABLE_KEY: "pk_live" }),
    });
    expect(result).toBe("pulled");
    expect(existsSync(join(dir, ".env.secrets"))).toBe(true);
  });

  it("writes to a custom per-package output filename", async () => {
    // The monorepo writes distinct filenames per package (root `.env.local`,
    // `apps/backend/.env`, ...). Each manifest sits in its own dir; `output`
    // selects the filename written there.
    await pullManifest({
      manifest: manifest({ paths: ["clerk"], output: ".env.local" }),
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
      manifest: manifest({ paths: ["clerk"], output: ".env" }),
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
        paths: ["google"],
        output: ".env",
        aliases: {
          GOOGLE_MAPS_API_KEY: [
            "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
            "VITE_GOOGLE_MAPS_API_KEY",
          ],
        },
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

  it("writes only the allowlisted key when `include` is set", async () => {
    // The /stripe folder holds a server secret and a public key; a client
    // package emits only the public key — server secrets must not reach the
    // client build's env.
    await pullManifest({
      manifest: manifest({
        paths: ["stripe"],
        output: ".env",
        aliases: {
          STRIPE_PUBLISHABLE_KEY: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
        },
        include: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      }),
      repoRoot: dir,
      envName: "development",
      provider: fakeProvider({
        STRIPE_SECRET_KEY: "sk_live",
        STRIPE_PUBLISHABLE_KEY: "pk_live",
      }),
    });

    const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
    expect(parsed).toEqual({ EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live" });
    expect(parsed.STRIPE_SECRET_KEY).toBeUndefined();
    expect(parsed.STRIPE_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("fails the pull when `include` names a key no folder produced", async () => {
    await expect(
      pullManifest({
        manifest: manifest({
          paths: ["stripe"],
          output: ".env",
          include: ["NONEXISTENT_KEY"],
        }),
        repoRoot: dir,
        envName: "development",
        provider: fakeProvider({ STRIPE_SECRET_KEY: "sk_live" }),
      })
    ).rejects.toThrow(/NONEXISTENT_KEY/);
  });

  describe("fetch: keys (wire-level least privilege)", () => {
    it("requests only the include keys and never reads whole folders", async () => {
      const rec = recordingProvider({
        STRIPE_SECRET_KEY: "sk_live",
        STRIPE_PUBLISHABLE_KEY: "pk_live",
      });
      await pullManifest({
        manifest: manifest({
          paths: ["stripe"],
          output: ".env",
          fetch: "keys",
          include: ["STRIPE_PUBLISHABLE_KEY"],
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

    it("reverse-maps an aliased include target to fetch its canonical source", async () => {
      const rec = recordingProvider({
        STRIPE_PUBLISHABLE_KEY: "pk_live",
        STRIPE_SECRET_KEY: "sk_live",
      });
      await pullManifest({
        manifest: manifest({
          paths: ["stripe"],
          output: ".env",
          fetch: "keys",
          aliases: {
            STRIPE_PUBLISHABLE_KEY: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
          },
          include: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
        }),
        repoRoot: dir,
        envName: "development",
        provider: rec.provider,
      });

      const parsed = parseDotenv(readFileSync(join(dir, ".env"), "utf8"));
      expect(parsed).toEqual({ EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live" });
      // Fetched the canonical source (the alias target isn't a real vault key).
      expect(rec.requestedKeys).toContain("STRIPE_PUBLISHABLE_KEY");
      expect(rec.requestedKeys).not.toContain("STRIPE_SECRET_KEY");
    });

    it("throws when fetch: keys is set without an include allowlist", async () => {
      await expect(
        pullManifest({
          manifest: manifest({
            paths: ["stripe"],
            output: ".env",
            fetch: "keys",
          }),
          repoRoot: dir,
          envName: "development",
          provider: fakeProvider({ STRIPE_SECRET_KEY: "sk_live" }),
        })
      ).rejects.toThrow(/requires an include allowlist/);
    });

    it("still fails when an include key exists in no folder", async () => {
      await expect(
        pullManifest({
          manifest: manifest({
            paths: ["stripe"],
            output: ".env",
            fetch: "keys",
            include: ["NONEXISTENT_KEY"],
          }),
          repoRoot: dir,
          envName: "development",
          provider: fakeProvider({ STRIPE_SECRET_KEY: "sk_live" }),
        })
      ).rejects.toThrow(/NONEXISTENT_KEY/);
    });
  });
});
