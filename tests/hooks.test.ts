import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { keysForScope, runAdvertiseKeysHooks } from "../src/hooks.js";

describe("hooks — advertise keys", () => {
  const input = {
    runtimeKeys: ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"],
    allKeys: ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "FLY_API_TOKEN"],
  };

  it("runtime scope returns sorted runtime keys only", () => {
    expect(keysForScope({ envVar: "X", scope: "runtime" }, input)).toEqual([
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ]);
  });

  it("defaults to runtime scope", () => {
    expect(keysForScope({ envVar: "X" }, input)).toEqual([
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ]);
  });

  it("all scope includes deploy-only keys", () => {
    expect(keysForScope({ envVar: "X", scope: "all" }, input)).toEqual([
      "CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "FLY_API_TOKEN",
    ]);
  });

  let tempDir: string;
  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes each hook's key list as a plain GITHUB_ENV var", () => {
    tempDir = mkdtempSync(join(tmpdir(), "infiscml-hooks-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    runAdvertiseKeysHooks(
      envFile,
      [{ envVar: "INFISCML_FLY_KEYS", scope: "runtime" }],
      input
    );
    expect(readFileSync(envFile, "utf8")).toBe(
      "INFISCML_FLY_KEYS=CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY\n"
    );
  });

  it("no-ops when no hooks are configured", () => {
    tempDir = mkdtempSync(join(tmpdir(), "infiscml-hooks-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    runAdvertiseKeysHooks(envFile, undefined, input);
    expect(() => readFileSync(envFile, "utf8")).toThrow();
  });
});
