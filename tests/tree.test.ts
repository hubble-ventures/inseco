import { describe, expect, it } from "vitest";
import { loadManifestJson, resolveCompiledFolders } from "../src/manifest.js";
import { compileTree } from "../src/tree.js";

describe("compileTree", () => {
  it("compiles bare string entries into keys with no aliases", () => {
    const folders = compileTree([{ stripe: ["A", "B"] }]);
    expect(folders).toEqual([
      {
        path: "stripe",
        keys: [
          { key: "A", aliases: [] },
          { key: "B", aliases: [] },
        ],
      },
    ]);
  });

  it("compiles an alias entry (string value)", () => {
    const folders = compileTree([
      { posthog: [{ POSTHOG_PROJECT_TOKEN: "VITE_POSTHOG_KEY" }] },
    ]);
    expect(folders).toEqual([
      {
        path: "posthog",
        keys: [{ key: "POSTHOG_PROJECT_TOKEN", aliases: ["VITE_POSTHOG_KEY"] }],
      },
    ]);
  });

  it("expresses several targets as repeated single-target alias entries", () => {
    const folders = compileTree([
      {
        google: [
          { GOOGLE_MAPS_API_KEY: "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY" },
          { GOOGLE_MAPS_API_KEY: "VITE_GOOGLE_MAPS_API_KEY" },
        ],
      },
    ]);
    expect(folders[0].keys).toEqual([
      { key: "GOOGLE_MAPS_API_KEY", aliases: ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"] },
      { key: "GOOGLE_MAPS_API_KEY", aliases: ["VITE_GOOGLE_MAPS_API_KEY"] },
    ]);
  });

  it("emits keys in array order, mixing bare and aliased", () => {
    const folders = compileTree([
      { clerk: ["CLERK_SECRET_KEY", { CLERK_PUBLISHABLE_KEY: "V" }] },
    ]);
    expect(folders[0].keys.map((k) => k.key)).toEqual([
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
    ]);
  });

  it("joins a subfolder path and emits parent before child", () => {
    const folders = compileTree([
      {
        posthog: [
          "POSTHOG_PROJECT_TOKEN",
          { sub: ["KEY_2", { KEY_3: "KEY_ALIAS" }] },
        ],
      },
    ]);
    expect(folders.map((f) => f.path)).toEqual(["posthog", "posthog/sub"]);
    expect(folders[1].keys).toEqual([
      { key: "KEY_2", aliases: [] },
      { key: "KEY_3", aliases: ["KEY_ALIAS"] },
    ]);
  });

  it("skips a subfolder-only folder itself but still emits its children", () => {
    const folders = compileTree([{ vendor: [{ app: ["A"] }] }]);
    // `vendor` declares no direct keys, so it produces no folder entry.
    expect(folders).toEqual([
      { path: "vendor/app", keys: [{ key: "A", aliases: [] }] },
    ]);
  });

  it("supports multi-segment subfolder names", () => {
    const folders = compileTree([{ a: [{ "b/c": ["K"] }] }]);
    expect(folders[0].path).toBe("a/b/c");
  });
});

describe("tree schema validation", () => {
  it("rejects an empty folder array", () => {
    expect(() => loadManifestJson({ secrets: [{ stripe: [] }] })).toThrow();
  });

  it("rejects an empty secrets array", () => {
    expect(() => loadManifestJson({ secrets: [] })).toThrow();
  });

  it("rejects a top-level entry that isn't a folder object", () => {
    expect(() => loadManifestJson({ secrets: ["stripe"] })).toThrow();
  });

  it("rejects a top-level folder whose value is not an array", () => {
    expect(() => loadManifestJson({ secrets: [{ stripe: "X" }] })).toThrow();
  });

  it("rejects an empty object entry (no alias or subfolder)", () => {
    expect(() => loadManifestJson({ secrets: [{ stripe: [{}] }] })).toThrow();
  });

  it("rejects an invalid env var name as a bare key", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ stripe: ["bad-name"] }] })
    ).toThrow();
  });

  it("rejects an invalid alias source", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ stripe: [{ "bad-source": "X" }] }] })
    ).toThrow();
  });

  it("rejects an invalid alias target", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ stripe: [{ A: "1-bad" }] }] })
    ).toThrow();
  });

  it("rejects an entry value that is neither string nor array", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ stripe: [{ A: 123 }] }] })
    ).toThrow();
  });

  it("rejects a non-string/non-object entry", () => {
    expect(() => loadManifestJson({ secrets: [{ stripe: [123] }] })).toThrow();
  });

  it("rejects an invalid folder name", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ "Bad Folder": ["A"] }] })
    ).toThrow();
  });

  it("accepts a valid nested tree", () => {
    const m = loadManifestJson({
      secrets: [
        {
          posthog: [
            { POSTHOG_PROJECT_TOKEN: "VITE_POSTHOG_KEY" },
            { sub: ["KEY_2"] },
          ],
        },
      ],
    });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual([
      "posthog",
      "posthog/sub",
    ]);
  });
});

describe("resolveCompiledFolders — profile replace semantics", () => {
  const m = loadManifestJson({
    secrets: [{ clerk: ["CLERK_SECRET_KEY"] }],
    profiles: {
      deploy: {
        secrets: [{ clerk: ["CLERK_SECRET_KEY"] }, { fly: ["FLY_API_TOKEN"] }],
      },
    },
  });

  it("compiles the root tree by default", () => {
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual(["clerk"]);
  });

  it("a profile tree replaces the root tree", () => {
    expect(resolveCompiledFolders(m, "deploy").map((f) => f.path)).toEqual([
      "clerk",
      "fly",
    ]);
  });

  it("throws for an unknown profile", () => {
    expect(() => resolveCompiledFolders(m, "nope")).toThrow(/Unknown profile/);
  });
});
