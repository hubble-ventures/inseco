import { describe, expect, it } from "vitest";
import { loadManifestJson, resolveCompiledFolders } from "../src/manifest.js";
import { compileTree } from "../src/tree.js";

describe("compileTree", () => {
  it("compiles raw keys into a folder with no aliases", () => {
    const folders = compileTree({ stripe: { raw: ["A", "B"] } });
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

  it("compiles an aliased source with a single target", () => {
    const folders = compileTree({
      posthog: { aliased: { POSTHOG_PROJECT_TOKEN: "VITE_POSTHOG_KEY" } },
    });
    expect(folders).toEqual([
      {
        path: "posthog",
        keys: [{ key: "POSTHOG_PROJECT_TOKEN", aliases: ["VITE_POSTHOG_KEY"] }],
      },
    ]);
  });

  it("compiles an aliased source with several targets", () => {
    const folders = compileTree({
      google: {
        aliased: {
          GOOGLE_MAPS_API_KEY: [
            "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
            "VITE_GOOGLE_MAPS_API_KEY",
          ],
        },
      },
    });
    expect(folders[0].keys[0]).toEqual({
      key: "GOOGLE_MAPS_API_KEY",
      aliases: [
        "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
        "VITE_GOOGLE_MAPS_API_KEY",
      ],
    });
  });

  it("emits raw before aliased within a folder", () => {
    const folders = compileTree({
      clerk: { raw: ["CLERK_SECRET_KEY"], aliased: { CLERK_PUBLISHABLE_KEY: "V" } },
    });
    expect(folders[0].keys.map((k) => k.key)).toEqual([
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
    ]);
  });

  it("joins a subfolder path and emits parent before child", () => {
    const folders = compileTree({
      posthog: {
        raw: ["POSTHOG_PROJECT_TOKEN"],
        "/sub": { raw: ["KEY_2"], aliased: { KEY_3: "KEY_ALIAS" } },
      },
    });
    expect(folders.map((f) => f.path)).toEqual(["posthog", "posthog/sub"]);
    expect(folders[1].keys).toEqual([
      { key: "KEY_2", aliases: [] },
      { key: "KEY_3", aliases: ["KEY_ALIAS"] },
    ]);
  });

  it("skips a subfolder-only node itself but still emits its children", () => {
    const folders = compileTree({
      vendor: { "/app": { raw: ["A"] } },
    });
    // The `vendor` node declares no direct keys, so it produces no folder entry.
    expect(folders).toEqual([{ path: "vendor/app", keys: [{ key: "A", aliases: [] }] }]);
  });

  it("supports multi-segment subfolder names", () => {
    const folders = compileTree({ a: { "/b/c": { raw: ["K"] } } });
    expect(folders[0].path).toBe("a/b/c");
  });
});

describe("tree schema validation", () => {
  it("rejects an empty folder node", () => {
    expect(() => loadManifestJson({ tree: { stripe: {} } })).toThrow();
  });

  it("rejects an empty tree", () => {
    expect(() => loadManifestJson({ tree: {} })).toThrow();
  });

  it("rejects an unknown bucket name", () => {
    expect(() =>
      loadManifestJson({ tree: { stripe: { keys: ["A"] } } })
    ).toThrow();
  });

  it("rejects an empty aliased bucket", () => {
    // A node with only `aliased: {}` is non-empty at the node level but declares
    // no keys — it would compile to nothing and silently emit zero secrets.
    expect(() =>
      loadManifestJson({ tree: { stripe: { aliased: {} } } })
    ).toThrow();
  });

  it("rejects an invalid env var name in raw", () => {
    expect(() =>
      loadManifestJson({ tree: { stripe: { raw: ["bad-name"] } } })
    ).toThrow();
  });

  it("rejects an invalid alias target", () => {
    expect(() =>
      loadManifestJson({ tree: { stripe: { aliased: { A: "1-bad" } } } })
    ).toThrow();
  });

  it("rejects an empty raw array", () => {
    expect(() =>
      loadManifestJson({ tree: { stripe: { raw: [] } } })
    ).toThrow();
  });

  it("rejects an invalid folder name", () => {
    expect(() =>
      loadManifestJson({ tree: { "Bad Folder": { raw: ["A"] } } })
    ).toThrow();
  });

  it("accepts a valid nested tree", () => {
    const m = loadManifestJson({
      tree: {
        posthog: {
          aliased: { POSTHOG_PROJECT_TOKEN: "VITE_POSTHOG_KEY" },
          "/sub": { raw: ["KEY_2"] },
        },
      },
    });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual([
      "posthog",
      "posthog/sub",
    ]);
  });
});

describe("resolveCompiledFolders — profile replace semantics", () => {
  const m = loadManifestJson({
    tree: { clerk: { raw: ["CLERK_SECRET_KEY"] } },
    profiles: {
      deploy: {
        tree: {
          clerk: { raw: ["CLERK_SECRET_KEY"] },
          fly: { raw: ["FLY_API_TOKEN"] },
        },
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
