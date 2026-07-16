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
  };
}

describe("pullManifest — output paths + multi-target aliases", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inseco-pull-"));
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
});
