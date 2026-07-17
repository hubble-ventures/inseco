import { describe, expect, it } from "vitest";
import {
  checkFetchIncludeConsistency,
  loadManifestJson,
  resolveFetchMode,
  resolveInclude,
  resolvePaths,
  resolveSecretsOutputPath,
} from "../src/manifest.js";
import { resolveOptionalKeys } from "../src/optional-keys.js";

describe("manifest", () => {
  it("loads valid manifest", () => {
    const m = loadManifestJson({
      paths: ["clerk", "vendor/app"],
    });
    expect(m.paths).toEqual(["clerk", "vendor/app"]);
  });

  it("rejects invalid path characters", () => {
    expect(() => loadManifestJson({ paths: ["bad path"] })).toThrow();
  });

  it("resolves default paths", () => {
    const m = loadManifestJson({ paths: ["clerk"] });
    expect(resolvePaths(m)).toEqual(["clerk"]);
  });

  it("resolves profile paths replacing default", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      profiles: {
        release: { paths: ["clerk", "fly", "vendor/app"] },
      },
    });
    expect(resolvePaths(m, "release")).toEqual(["clerk", "fly", "vendor/app"]);
  });

  it("throws for unknown profile", () => {
    const m = loadManifestJson({ paths: ["clerk"] });
    expect(() => resolvePaths(m, "nope")).toThrow(/Unknown profile/);
  });

  it("rejects output path traversal", () => {
    expect(() => resolveSecretsOutputPath("/tmp/pkg", "../escape")).toThrow(
      /Invalid secrets output/
    );
  });

  it("loads an include allowlist at the root and per profile", () => {
    const m = loadManifestJson({
      paths: ["stripe"],
      include: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      profiles: {
        deploy: { paths: ["stripe", "fly"], include: ["STRIPE_SECRET_KEY"] },
      },
    });
    expect(resolveInclude(m)).toEqual(["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(resolveInclude(m, "deploy")).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("a profile without include inherits the root include", () => {
    const m = loadManifestJson({
      paths: ["stripe"],
      include: ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      profiles: { deploy: { paths: ["stripe", "fly"] } },
    });
    expect(resolveInclude(m, "deploy")).toEqual([
      "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ]);
  });

  it("returns undefined when no include is set (emit all keys)", () => {
    const m = loadManifestJson({ paths: ["stripe"] });
    expect(resolveInclude(m)).toBeUndefined();
  });

  it("rejects an empty include array", () => {
    expect(() =>
      loadManifestJson({ paths: ["stripe"], include: [] })
    ).toThrow();
  });

  it("rejects an invalid env var name in include", () => {
    expect(() =>
      loadManifestJson({ paths: ["stripe"], include: ["bad-name"] })
    ).toThrow();
  });

  describe("resolveFetchMode", () => {
    it("defaults to folder when fetch is unset", () => {
      expect(resolveFetchMode(loadManifestJson({ paths: ["x"] }))).toBe(
        "folder"
      );
    });

    it("reads the root fetch mode", () => {
      const m = loadManifestJson({
        paths: ["x"],
        fetch: "keys",
        include: ["A"],
      });
      expect(resolveFetchMode(m)).toBe("keys");
    });

    it("a profile fetch replaces the root fetch", () => {
      const m = loadManifestJson({
        paths: ["x"],
        fetch: "keys",
        include: ["A"],
        profiles: { deploy: { paths: ["x", "y"], fetch: "folder" } },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("folder");
    });

    it("a profile without fetch inherits the root fetch", () => {
      const m = loadManifestJson({
        paths: ["x"],
        fetch: "keys",
        include: ["A"],
        profiles: { deploy: { paths: ["x", "y"] } },
      });
      expect(resolveFetchMode(m, "deploy")).toBe("keys");
    });

    it("rejects an unknown fetch mode", () => {
      expect(() =>
        loadManifestJson({ paths: ["x"], fetch: "network" })
      ).toThrow();
    });
  });

  describe("checkFetchIncludeConsistency", () => {
    it("passes when keys mode has an include", () => {
      const m = loadManifestJson({
        paths: ["x"],
        fetch: "keys",
        include: ["A"],
      });
      expect(checkFetchIncludeConsistency(m)).toEqual([]);
    });

    it("flags root keys mode without an include", () => {
      const m = loadManifestJson({ paths: ["x"], fetch: "keys" });
      expect(checkFetchIncludeConsistency(m)).toHaveLength(1);
      expect(checkFetchIncludeConsistency(m)[0]).toMatch(/root/);
    });

    it("flags a profile that resolves to keys mode without an include", () => {
      // Root include is absent; the profile turns on keys mode but adds no
      // include, so running that profile would have nothing to fetch.
      const m = loadManifestJson({
        paths: ["x"],
        profiles: { deploy: { paths: ["x"], fetch: "keys" } },
      });
      const issues = checkFetchIncludeConsistency(m);
      expect(issues.some((i) => i.includes('profile "deploy"'))).toBe(true);
    });

    it("passes when a keys-mode profile inherits the root include", () => {
      const m = loadManifestJson({
        paths: ["x"],
        include: ["A"],
        profiles: { deploy: { paths: ["x"], fetch: "keys" } },
      });
      expect(checkFetchIncludeConsistency(m)).toEqual([]);
    });

    it("passes for plain folder mode with no include", () => {
      expect(
        checkFetchIncludeConsistency(loadManifestJson({ paths: ["x"] }))
      ).toEqual([]);
    });
  });

  it("loads environments with optionalKeys", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      environments: {
        preview: { optionalKeys: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      },
    });
    expect(resolveOptionalKeys(m, "preview")).toEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ]);
  });
});
