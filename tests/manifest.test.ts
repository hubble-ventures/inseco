import { describe, expect, it } from "vitest";
import {
  loadManifestJson,
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
