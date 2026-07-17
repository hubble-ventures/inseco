import { describe, expect, it } from "vitest";
import {
  fetchManifestSecrets,
  fetchSecretsForKeys,
  isCi,
  keysForCiStub,
  shouldSkipInfisicalPull,
} from "../src/ci-skip.js";
import { loadManifestJson } from "../src/manifest.js";
import type { SecretsProvider } from "../src/providers/types.js";

/** Provider whose folders each hold a declared slice of a global key set. */
function folderKeyProvider(
  byFolder: Record<string, Record<string, string>>
): { provider: SecretsProvider; keyCalls: Array<[string, string[]]> } {
  const keyCalls: Array<[string, string[]]> = [];
  const provider: SecretsProvider = {
    async exportFolder(_env, folder) {
      return { ...(byFolder[folder] ?? {}) };
    },
    async exportKeys(_env, folder, keys) {
      keyCalls.push([folder, keys]);
      const folderSecrets = byFolder[folder] ?? {};
      const out: Record<string, string> = {};
      for (const key of keys) {
        if (key in folderSecrets) out[key] = folderSecrets[key];
      }
      return out;
    },
  };
  return { provider, keyCalls };
}

describe("ci-skip", () => {
  const withSkipWhen = loadManifestJson({
    paths: ["clerk"],
    ci: { skipWhenEnv: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
  });

  const withStub = loadManifestJson({
    paths: ["clerk"],
    ci: { stubInCi: true },
  });

  it("isCi detects CI env", () => {
    const prev = process.env.CI;
    process.env.CI = "true";
    expect(isCi()).toBe(true);
    process.env.CI = prev;
  });

  it("skipWhenEnv skips when all keys present in CI", () => {
    const prevCi = process.env.CI;
    const prevKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CI = "true";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    expect(shouldSkipInfisicalPull(withSkipWhen, false)).toBe(true);
    process.env.CI = prevCi;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevKey;
  });

  it("skipWhenEnv does not skip when key missing", () => {
    const prevCi = process.env.CI;
    const prevKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CI = "true";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    expect(shouldSkipInfisicalPull(withSkipWhen, false)).toBe(false);
    process.env.CI = prevCi;
    if (prevKey !== undefined) {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevKey;
    }
  });

  it("stubInCi skips in CI", () => {
    const prevCi = process.env.CI;
    process.env.CI = "true";
    expect(shouldSkipInfisicalPull(withStub, false)).toBe(true);
    process.env.CI = prevCi;
  });

  it("force never skips", () => {
    const prevCi = process.env.CI;
    process.env.CI = "true";
    expect(shouldSkipInfisicalPull(withStub, true)).toBe(false);
    process.env.CI = prevCi;
  });

  it("keysForCiStub returns skipWhenEnv keys", () => {
    expect(keysForCiStub(withSkipWhen)).toEqual([
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ]);
  });
});

describe("fetchSecretsForKeys / fetchManifestSecrets", () => {
  it("merges per-key reads across folders (keys spanning paths)", async () => {
    const { provider } = folderKeyProvider({
      clerk: { CLERK_SECRET_KEY: "sk" },
      stripe: { STRIPE_SECRET_KEY: "ss" },
    });
    const merged = await fetchSecretsForKeys(
      provider,
      "development",
      ["clerk", "stripe"],
      ["CLERK_SECRET_KEY", "STRIPE_SECRET_KEY"]
    );
    expect(merged).toEqual({
      CLERK_SECRET_KEY: "sk",
      STRIPE_SECRET_KEY: "ss",
    });
  });

  it("folder mode reads whole folders (no per-key calls)", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      clerk: { A: "1", B: "2" },
    });
    const m = loadManifestJson({ paths: ["clerk"] });
    const merged = await fetchManifestSecrets(
      provider,
      "development",
      ["clerk"],
      m
    );
    expect(merged).toEqual({ A: "1", B: "2" });
    expect(keyCalls).toHaveLength(0);
  });

  it("keys mode fetches only the resolved include keys", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      stripe: { STRIPE_SECRET_KEY: "ss", STRIPE_PUBLISHABLE_KEY: "pk" },
    });
    const m = loadManifestJson({
      paths: ["stripe"],
      fetch: "keys",
      include: ["STRIPE_PUBLISHABLE_KEY"],
    });
    const merged = await fetchManifestSecrets(
      provider,
      "development",
      ["stripe"],
      m
    );
    expect(merged).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk" });
    expect(keyCalls).toEqual([["stripe", ["STRIPE_PUBLISHABLE_KEY"]]]);
  });

  it("throws in keys mode without an include", async () => {
    const { provider } = folderKeyProvider({ stripe: {} });
    const m = loadManifestJson({ paths: ["stripe"], fetch: "keys" });
    await expect(
      fetchManifestSecrets(provider, "development", ["stripe"], m)
    ).rejects.toThrow(/requires an include allowlist/);
  });
});
