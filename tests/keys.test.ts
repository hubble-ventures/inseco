import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  DEFAULT_PROFILE_LABEL,
  diffKeyNames,
  emittedKeyNames,
  emittedNamesFor,
  hasKeyChange,
  KEYS_SCHEMA_VERSION,
  profileLabels,
  serializeSnapshot,
} from "../src/keys.js";
import { loadManifestJson } from "../src/manifest.js";
import { compileTree } from "../src/tree.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("emittedKeyNames", () => {
  it("emits canonical keys plus alias targets, deduped and sorted", () => {
    const folders = compileTree([
      {
        clerk: [
          { CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" },
          "CLERK_SECRET_KEY",
        ],
      },
      { posthog: ["POSTHOG_PROJECT_TOKEN", { posthog: ["POSTHOG_EU_HOST"] }] },
    ]);
    expect(emittedKeyNames(folders)).toEqual([
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "POSTHOG_EU_HOST",
      "POSTHOG_PROJECT_TOKEN",
      "VITE_CLERK_PUBLISHABLE_KEY",
    ]);
  });

  it("dedupes a name that is both a canonical key and an alias target", () => {
    const folders = compileTree([
      { a: [{ SHARED: "ALIASED" }] },
      { b: ["ALIASED"] },
    ]);
    expect(emittedKeyNames(folders)).toEqual(["ALIASED", "SHARED"]);
  });
});

describe("emittedNamesFor", () => {
  const manifest = loadManifestJson({
    secrets: [{ clerk: ["CLERK_SECRET_KEY"] }],
    profiles: {
      deploy: { secrets: [{ clerk: ["CLERK_SECRET_KEY"] }, { fly: ["FLY_API_TOKEN"] }] },
    },
  });

  it("resolves the base tree with no profile", () => {
    expect(emittedNamesFor(manifest)).toEqual(["CLERK_SECRET_KEY"]);
  });

  it("resolves a named profile", () => {
    expect(emittedNamesFor(manifest, "deploy")).toEqual([
      "CLERK_SECRET_KEY",
      "FLY_API_TOKEN",
    ]);
  });

  it("returns [] for a null manifest (absent at a ref)", () => {
    expect(emittedNamesFor(null)).toEqual([]);
    expect(emittedNamesFor(null, "deploy")).toEqual([]);
  });

  it("returns [] for a profile the manifest doesn't declare, instead of throwing", () => {
    // resolveCompiledFolders throws on an unknown profile; the diff path needs
    // the empty set so the missing side reports every key as added/removed.
    expect(emittedNamesFor(manifest, "nope")).toEqual([]);
  });
});

describe("diffKeyNames", () => {
  it("reports added and removed, sorted", () => {
    const diff = diffKeyNames(["B", "A", "C"], ["C", "A", "D"]);
    expect(diff).toEqual({ added: ["D"], removed: ["B"] });
    expect(hasKeyChange(diff)).toBe(true);
  });

  it("is empty for identical sets", () => {
    expect(hasKeyChange(diffKeyNames(["A", "B"], ["B", "A"]))).toBe(false);
  });
});

describe("snapshot", () => {
  const manifests = [
    {
      id: "web",
      config: loadManifestJson({
        secrets: [{ clerk: [{ CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" }] }],
      }),
    },
    {
      id: "api",
      config: loadManifestJson({
        secrets: [{ stripe: ["STRIPE_SECRET_KEY"] }],
        profiles: { deploy: { secrets: [{ fly: ["FLY_API_TOKEN"] }] } },
      }),
    },
  ];

  it("keys packages by id (sorted) and profiles by label, env-independent", () => {
    const snap = buildSnapshot(manifests);
    expect(Object.keys(snap.packages)).toEqual(["api", "web"]);
    expect(snap.packages.api).toEqual({
      [DEFAULT_PROFILE_LABEL]: ["STRIPE_SECRET_KEY"],
      deploy: ["FLY_API_TOKEN"],
    });
    expect(snap.schemaVersion).toBe(KEYS_SCHEMA_VERSION);
    expect(snap.mode).toBe("static");
  });

  it("serializes deterministically (byte-stable for the lockfile)", () => {
    const a = serializeSnapshot(buildSnapshot(manifests));
    const b = serializeSnapshot(buildSnapshot([...manifests].reverse()));
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
  });

  it("profileLabels lists the default first, then named profiles sorted", () => {
    expect(profileLabels(manifests[1].config)).toEqual([
      DEFAULT_PROFILE_LABEL,
      "deploy",
    ]);
  });
});

describe("value-free guarantee (ADR 0001 §3)", () => {
  // The entire premise of keys/diff is that they never touch secret material.
  // Enforced by construction: neither the logic module nor the commands may
  // reach a SecretsProvider or any vault fetch. This asserts that structurally,
  // so a future edit that wires in a provider trips the test.
  for (const rel of ["keys.ts", "commands/keys.ts", "commands/diff.ts"]) {
    it(`${rel} never imports or references a provider`, () => {
      const source = readFileSync(join(srcDir, rel), "utf8");
      expect(source).not.toMatch(/providers?\//);
      expect(source).not.toMatch(/Provider/);
      expect(source).not.toMatch(/exportFolder|exportKeys/);
    });
  }
});
