import { describe, expect, it } from "vitest";
import { loadManifestJson } from "../src/manifest.js";
import {
  logMissingOptionalKeys,
  resolveOptionalKeys,
} from "../src/optional-keys.js";

describe("optional keys", () => {
  it("resolves optional keys for an environment", () => {
    const manifest = loadManifestJson({
      tree: { clerk: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      environments: {
        preview: {
          optionalKeys: ["CLERK_WEBHOOK_SIGNING_SECRET"],
        },
      },
    });
    expect(resolveOptionalKeys(manifest, "preview")).toEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ]);
    expect(resolveOptionalKeys(manifest, "production")).toEqual([]);
  });

  it("logs a notice for missing optional keys", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      logMissingOptionalKeys({ CLERK_SECRET_KEY: "sk_test" }, [
        "CLERK_WEBHOOK_SIGNING_SECRET",
        "CLERK_SECRET_KEY",
      ]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("CLERK_WEBHOOK_SIGNING_SECRET");
      expect(logs[0]).toContain("::notice::");
    } finally {
      console.log = orig;
    }
  });
});
