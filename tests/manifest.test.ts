import { describe, expect, it } from "vitest";
import {
  loadManifestJson,
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
