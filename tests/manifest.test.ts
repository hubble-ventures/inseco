import { describe, expect, it } from "vitest";
import {
  loadManifestJson,
  resolveCompiledFolders,
  resolveFetchMode,
  resolveSecretsOutputPath,
} from "../src/manifest.js";
import { resolveOptionalKeys } from "../src/optional-keys.js";

describe("manifest", () => {
  it("loads a valid manifest", () => {
    const m = loadManifestJson({
      tree: {
        clerk: ["CLERK_SECRET_KEY"],
        "vendor/app": ["K"],
      },
    });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual([
      "clerk",
      "vendor/app",
    ]);
  });

  it("requires a tree", () => {
    expect(() => loadManifestJson({})).toThrow();
  });

  it("rejects invalid folder-name characters", () => {
    expect(() =>
      loadManifestJson({ tree: { "bad path": ["K"] } })
    ).toThrow();
  });

  it("resolves default folders", () => {
    const m = loadManifestJson({ tree: { clerk: ["K"] } });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual(["clerk"]);
  });

  it("resolves profile folders replacing the default tree", () => {
    const m = loadManifestJson({
      tree: { clerk: ["K"] },
      profiles: {
        release: {
          tree: {
            clerk: ["K"],
            fly: ["FLY_API_TOKEN"],
            "vendor/app": ["V"],
          },
        },
      },
    });
    expect(resolveCompiledFolders(m, "release").map((f) => f.path)).toEqual([
      "clerk",
      "fly",
      "vendor/app",
    ]);
  });

  it("throws for an unknown profile", () => {
    const m = loadManifestJson({ tree: { clerk: ["K"] } });
    expect(() => resolveCompiledFolders(m, "nope")).toThrow(/Unknown profile/);
  });

  it("rejects output path traversal", () => {
    expect(() => resolveSecretsOutputPath("/tmp/pkg", "../escape")).toThrow(
      /Invalid secrets output/
    );
  });

  describe("resolveFetchMode", () => {
    it("defaults to folder when fetch is unset", () => {
      expect(
        resolveFetchMode(loadManifestJson({ tree: { x: ["A"] } }))
      ).toBe("folder");
    });

    it("reads the root fetch mode", () => {
      const m = loadManifestJson({
        tree: { x: ["A"] },
        fetch: "keys",
      });
      expect(resolveFetchMode(m)).toBe("keys");
    });

    it("a profile fetch replaces the root fetch", () => {
      const m = loadManifestJson({
        tree: { x: ["A"] },
        fetch: "keys",
        profiles: {
          deploy: {
            tree: { x: ["A"], y: ["B"] },
            fetch: "folder",
          },
        },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("folder");
    });

    it("a profile without fetch inherits the root fetch", () => {
      const m = loadManifestJson({
        tree: { x: ["A"] },
        fetch: "keys",
        profiles: {
          deploy: { tree: { x: ["A"], y: ["B"] } },
        },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("keys");
    });

    it("rejects an unknown fetch mode", () => {
      expect(() =>
        loadManifestJson({ tree: { x: ["A"] }, fetch: "network" })
      ).toThrow();
    });
  });

  it("loads environments with optionalKeys", () => {
    const m = loadManifestJson({
      tree: { clerk: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      environments: {
        preview: { optionalKeys: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      },
    });
    expect(resolveOptionalKeys(m, "preview")).toEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ]);
  });
});
