import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findManifestFile,
  loadManifestFromDir,
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

  describe("manifest file discovery (YAML primary, JSON supported)", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "infisicml-manifest-"));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("returns null when no manifest exists", () => {
      expect(findManifestFile(dir)).toBeNull();
      expect(loadManifestFromDir(dir)).toBeNull();
    });

    it("loads and parses a YAML manifest", () => {
      writeFileSync(
        join(dir, "secrets.yaml"),
        "secrets:\n  - clerk:\n      - CLERK_SECRET_KEY\n"
      );
      const loaded = loadManifestFromDir(dir);
      expect(loaded?.file.format).toBe("yaml");
      expect(resolveCompiledFolders(loaded!.manifest).map((f) => f.path)).toEqual(
        ["clerk"]
      );
    });

    it("loads and parses a JSON manifest", () => {
      writeFileSync(
        join(dir, "secrets.json"),
        JSON.stringify({ secrets: [{ clerk: ["CLERK_SECRET_KEY"] }] })
      );
      const loaded = loadManifestFromDir(dir);
      expect(loaded?.file.format).toBe("json");
      expect(resolveCompiledFolders(loaded!.manifest).map((f) => f.path)).toEqual(
        ["clerk"]
      );
    });

    it("prefers secrets.yaml over secrets.json when both exist, and warns", () => {
      writeFileSync(join(dir, "secrets.yaml"), "secrets:\n  - from-yaml: [A]\n");
      writeFileSync(
        join(dir, "secrets.json"),
        JSON.stringify({ secrets: [{ "from-json": ["A"] }] })
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const loaded = loadManifestFromDir(dir);
      expect(loaded?.file.filename).toBe("secrets.yaml");
      expect(resolveCompiledFolders(loaded!.manifest).map((f) => f.path)).toEqual(
        ["from-yaml"]
      );
      // The shadowed JSON file is named in a warning so it can't go unnoticed.
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain("secrets.json");
      warn.mockRestore();
    });

    it("does not warn for a single manifest file", () => {
      writeFileSync(join(dir, "secrets.yaml"), "secrets:\n  - clerk: [K]\n");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      loadManifestFromDir(dir);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("supports the .yml extension", () => {
      writeFileSync(join(dir, "secrets.yml"), "secrets:\n  - clerk: [K]\n");
      expect(findManifestFile(dir)?.format).toBe("yaml");
    });
  });
});
