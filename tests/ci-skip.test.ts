import { describe, expect, it } from "vitest";
import {
  fetchCompiledFolders,
  isCi,
  keysForCiStub,
  materializeSecrets,
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
    secrets: [{ clerk: ["CLERK_SECRET_KEY"] }],
    ci: { skipWhenEnv: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
  });

  const withStub = loadManifestJson({
    secrets: [{ clerk: ["CLERK_SECRET_KEY"] }],
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

describe("fetchCompiledFolders + materializeSecrets", () => {
  it("keys mode merges per-key reads across folders", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      clerk: { CLERK_SECRET_KEY: "sk" },
      stripe: { STRIPE_SECRET_KEY: "ss" },
    });
    const folders = compileTree([
      { clerk: ["CLERK_SECRET_KEY"] },
      { stripe: ["STRIPE_SECRET_KEY"] },
    ]);
    const fetched = await fetchCompiledFolders(
      provider,
      "development",
      folders,
      "keys"
    );
    expect(materializeSecrets(fetched, [])).toEqual({
      CLERK_SECRET_KEY: "sk",
      STRIPE_SECRET_KEY: "ss",
    });
    expect(keyCalls).toEqual([
      ["clerk", ["CLERK_SECRET_KEY"]],
      ["stripe", ["STRIPE_SECRET_KEY"]],
    ]);
  });

  it("folder mode reads whole folders (no per-key calls)", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      clerk: { A: "1", B: "2" },
    });
    const folders = compileTree([{ clerk: ["A", "B"] }]);
    const fetched = await fetchCompiledFolders(
      provider,
      "development",
      folders,
      "folder"
    );
    expect(materializeSecrets(fetched, [])).toEqual({ A: "1", B: "2" });
    expect(keyCalls).toHaveLength(0);
  });

  it("folder mode selects only the declared keys (provenance-aware)", async () => {
    // The folder returns an extra, undeclared secret; it must not be emitted.
    const { provider } = folderKeyProvider({
      stripe: { STRIPE_SECRET_KEY: "ss", STRIPE_PUBLISHABLE_KEY: "pk" },
    });
    const folders = compileTree([{ stripe: ["STRIPE_PUBLISHABLE_KEY"] }]);
    const fetched = await fetchCompiledFolders(
      provider,
      "development",
      folders,
      "folder"
    );
    expect(materializeSecrets(fetched, [])).toEqual({
      STRIPE_PUBLISHABLE_KEY: "pk",
    });
  });

  it("keys mode fetches only the declared keys", async () => {
    const { provider, keyCalls } = folderKeyProvider({
      stripe: { STRIPE_SECRET_KEY: "ss", STRIPE_PUBLISHABLE_KEY: "pk" },
    });
    const folders = compileTree([{ stripe: ["STRIPE_PUBLISHABLE_KEY"] }]);
    const fetched = await fetchCompiledFolders(
      provider,
      "development",
      folders,
      "keys"
    );
    expect(materializeSecrets(fetched, [])).toEqual({
      STRIPE_PUBLISHABLE_KEY: "pk",
    });
    expect(keyCalls).toEqual([["stripe", ["STRIPE_PUBLISHABLE_KEY"]]]);
  });

  it("expands aliases from the FOLDER-LOCAL value, not the flat merge", () => {
    // /a and /b both declare a key named TOKEN with different values and
    // different alias targets. Each target must carry its own folder's value —
    // the pre-fix flat merge kept only one TOKEN and routed it to both.
    const folders = compileTree([
      { a: [{ TOKEN: "A_TOKEN" }] },
      { b: [{ TOKEN: "B_TOKEN" }] },
    ]);
    const fetched = [
      { folder: folders[0], selected: { TOKEN: "a" } },
      { folder: folders[1], selected: { TOKEN: "b" } },
    ];
    const merged = materializeSecrets(fetched, []);
    expect(merged.A_TOKEN).toBe("a");
    expect(merged.B_TOKEN).toBe("b");
  });

  it("enforces missing keys per folder, not by global name", () => {
    // TOKEN is declared in both /a and /b but only /b returns it. The /a
    // declaration is still a genuine miss and must fail — the flat map would
    // have contained TOKEN (from /b) and passed.
    const folders = compileTree([{ a: ["TOKEN"] }, { b: ["TOKEN"] }]);
    const fetched = [
      { folder: folders[0], selected: {} },
      { folder: folders[1], selected: { TOKEN: "b" } },
    ];
    expect(() => materializeSecrets(fetched, [])).toThrow(/TOKEN/);
  });

  it("allows a per-folder miss when the key name is optional", () => {
    const folders = compileTree([{ a: ["TOKEN"] }, { b: ["TOKEN"] }]);
    const fetched = [
      { folder: folders[0], selected: {} },
      { folder: folders[1], selected: { TOKEN: "b" } },
    ];
    expect(materializeSecrets(fetched, ["TOKEN"])).toEqual({ TOKEN: "b" });
  });
});
