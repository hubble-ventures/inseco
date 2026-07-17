import type { SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LocalProvider, type SpawnExportFn } from "../src/providers/local.js";

/** Build a fake `secrets get`: exit 0 with the value for known keys, else 1. */
function keySpawn(
  calls: string[][],
  present: Record<string, string>
): SpawnExportFn {
  return (command, args) => {
    calls.push(args);
    const key = args[2]; // ["secrets", "get", KEY, ...]
    const value = present[key];
    if (value === undefined) {
      return {
        status: 1,
        stdout: "",
        stderr: `secret ${key} not found`,
      } as unknown as SpawnSyncReturns<string>;
    }
    return {
      status: 0,
      stdout: `${value}\n`, // --plain prints the value with a trailing newline
      stderr: "",
    } as unknown as SpawnSyncReturns<string>;
  };
}

describe("LocalProvider.exportKeys — per-key probe", () => {
  it("returns found keys, trims the value, and skips non-zero exits", async () => {
    const calls: string[][] = [];
    const provider = new LocalProvider({
      projectId: "proj-1",
      spawn: keySpawn(calls, { STRIPE_PUBLISHABLE_KEY: "pk_live" }),
    });

    const secrets = await provider.exportKeys("development", "stripe", [
      "STRIPE_PUBLISHABLE_KEY",
      "STRIPE_SECRET_KEY", // exits non-zero → not in this folder → skipped
    ]);

    expect(secrets).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk_live" });
  });

  it("invokes `secrets get` per key with the folder path and project id", async () => {
    const calls: string[][] = [];
    const provider = new LocalProvider({
      projectId: "proj-1",
      spawn: keySpawn(calls, { A: "1", B: "2" }),
    });

    await provider.exportKeys("development", "vendor/app", ["A", "B"]);

    expect(calls).toHaveLength(2);
    for (const args of calls) {
      expect(args.slice(0, 2)).toEqual(["secrets", "get"]);
      expect(args).toContain("--path=/vendor/app");
      expect(args).toContain("--projectId=proj-1");
      expect(args).toContain("--env=development");
      expect(args).toContain("--plain");
      expect(args).toContain("--silent");
    }
  });

  it("returns an empty map when no requested key exists in the folder", async () => {
    const provider = new LocalProvider({
      projectId: "proj-1",
      spawn: keySpawn([], {}),
    });
    expect(
      await provider.exportKeys("development", "stripe", ["X", "Y"])
    ).toEqual({});
  });
});
