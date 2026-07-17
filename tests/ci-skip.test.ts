import { describe, expect, it } from "vitest";
import {
  fetchCompiledSecrets,
  isCi,
  keysForCiStub,
  shouldSkipInfisicalPull,
} from "../src/ci-skip.js";
import { loadManifestJson } from "../src/manifest.js";
import type { SecretsProvider } from "../src/providers/types.js";
import { compileTree } from "../src/tree.js";

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
    tree: { clerk: { raw: ["CLERK_SECRET_KEY"] } },
    ci: { skipWhenEnv: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
  });

  const withStub = loadManifestJson({
    tree: { clerk: { raw: ["CLERK_SECRET_KEY"] } },
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

describe("fetchCompiledSecrets", () => {
  it("keys mode merges per-key reads across folders", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      clerk: { CLERK_SECRET_KEY: "sk" },
      stripe: { STRIPE_SECRET_KEY: "ss" },
    });
    const folders = compileTree({
      clerk: { raw: ["CLERK_SECRET_KEY"] },
      stripe: { raw: ["STRIPE_SECRET_KEY"] },
    });
    const merged = await fetchCompiledSecrets(
      provider,
      "development",
      folders,
      "keys"
    );
    expect(merged).toEqual({ CLERK_SECRET_KEY: "sk", STRIPE_SECRET_KEY: "ss" });
    expect(keyCalls).toEqual([
      ["clerk", ["CLERK_SECRET_KEY"]],
      ["stripe", ["STRIPE_SECRET_KEY"]],
    ]);
  });

  it("folder mode reads whole folders (no per-key calls)", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      clerk: { A: "1", B: "2" },
    });
    const folders = compileTree({ clerk: { raw: ["A", "B"] } });
    const merged = await fetchCompiledSecrets(
      provider,
      "development",
      folders,
      "folder"
    );
    expect(merged).toEqual({ A: "1", B: "2" });
    expect(keyCalls).toHaveLength(0);
  });

  it("folder mode selects only the declared keys (provenance-aware)", async () => {
    // The folder returns an extra, undeclared secret; it must not be emitted.
    const { provider } = folderKeyProvider({
      stripe: { STRIPE_SECRET_KEY: "ss", STRIPE_PUBLISHABLE_KEY: "pk" },
    });
    const folders = compileTree({ stripe: { raw: ["STRIPE_PUBLISHABLE_KEY"] } });
    const merged = await fetchCompiledSecrets(
      provider,
      "development",
      folders,
      "folder"
    );
    expect(merged).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk" });
  });

  it("keys mode fetches only the declared keys", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      stripe: { STRIPE_SECRET_KEY: "ss", STRIPE_PUBLISHABLE_KEY: "pk" },
    });
    const folders = compileTree({ stripe: { raw: ["STRIPE_PUBLISHABLE_KEY"] } });
    const merged = await fetchCompiledSecrets(
      provider,
      "development",
      folders,
      "keys"
    );
    expect(merged).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk" });
    expect(keyCalls).toEqual([["stripe", ["STRIPE_PUBLISHABLE_KEY"]]]);
  });
});
