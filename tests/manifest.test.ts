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
      secrets: [
        { clerk: ["CLERK_SECRET_KEY"] },
        { "vendor/app": ["K"] },
      ],
    });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual([
      "clerk",
      "vendor/app",
    ]);
  });

  it("requires secrets", () => {
    expect(() => loadManifestJson({})).toThrow();
  });

  it("rejects invalid folder-name characters", () => {
    expect(() =>
      loadManifestJson({ secrets: [{ "bad path": ["K"] }] })
    ).toThrow();
  });

  it("resolves default folders", () => {
    const m = loadManifestJson({ secrets: [{ clerk: ["K"] }] });
    expect(resolveCompiledFolders(m).map((f) => f.path)).toEqual(["clerk"]);
  });

  it("resolves profile folders replacing the default tree", () => {
    const m = loadManifestJson({
      secrets: [{ clerk: ["K"] }],
      profiles: {
        release: {
          secrets: [
            { clerk: ["K"] },
            { fly: ["FLY_API_TOKEN"] },
            { "vendor/app": ["V"] },
          ],
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
    const m = loadManifestJson({ secrets: [{ clerk: ["K"] }] });
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
        resolveFetchMode(loadManifestJson({ secrets: [{ x: ["A"] }] }))
      ).toBe("folder");
    });

    it("reads the root fetch mode", () => {
      const m = loadManifestJson({
        secrets: [{ x: ["A"] }],
        fetch: "keys",
      });
      expect(resolveFetchMode(m)).toBe("keys");
    });

    it("a profile fetch replaces the root fetch", () => {
      const m = loadManifestJson({
        secrets: [{ x: ["A"] }],
        fetch: "keys",
        profiles: {
          deploy: {
            secrets: [{ x: ["A"] }, { y: ["B"] }],
            fetch: "folder",
          },
        },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("folder");
    });

    it("a profile without fetch inherits the root fetch", () => {
      const m = loadManifestJson({
        secrets: [{ x: ["A"] }],
        fetch: "keys",
        profiles: {
          deploy: { secrets: [{ x: ["A"] }, { y: ["B"] }] },
        },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("keys");
    });

    it("rejects an unknown fetch mode", () => {
      expect(() =>
        loadManifestJson({ secrets: [{ x: ["A"] }], fetch: "network" })
      ).toThrow();
    });
  });

  it("loads environments with optionalKeys", () => {
    const m = loadManifestJson({
      secrets: [{ clerk: ["CLERK_WEBHOOK_SIGNING_SECRET"] }],
      environments: {
        preview: { optionalKeys: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      },
    });
    expect(resolveOptionalKeys(m, "preview")).toEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ]);
  });
});
