import type { SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LocalProvider, type SpawnExportFn } from "../src/providers/local.js";

/**
 * Fake `infisical export`: serves a folder's secrets as dotenv on exit 0. The
 * local lane fetches the whole folder once (the CLI has no single-secret server
 * read) and selects keys client-side, so exportKeys goes through `export`.
 */
function exportSpawn(
  calls: string[][],
  byFolder: Record<string, Record<string, string>>
): SpawnExportFn {
  return (_command, args) => {
    calls.push(args);
    const pathArg = args.find((a) => a.startsWith("--path="))?.slice(7) ?? "";
    const folder = pathArg.replace(/^\//, "");
    const secrets = byFolder[folder];
    if (secrets === undefined) {
      return {
        status: 1,
        stdout: "",
        stderr: "folder not found",
      } as unknown as SpawnSyncReturns<string>;
    }
    const dotenv = Object.entries(secrets)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    return {
      status: 0,
      stdout: `${dotenv}\n`,
      stderr: "",
    } as unknown as SpawnSyncReturns<string>;
  };
}

describe("LocalProvider.exportKeys — folder fetch + client-side select", () => {
  it("returns only the requested keys present in the folder", async () => {
    const calls: string[][] = [];
    const provider = new LocalProvider({
      projectId: "proj-1",
      spawn: exportSpawn(calls, {
        stripe: {
          STRIPE_SECRET_KEY: "sk_live",
          STRIPE_PUBLISHABLE_KEY: "pk_live",
        },
      }),
    });

    const secrets = await provider.exportKeys("development", "stripe", [
      "STRIPE_PUBLISHABLE_KEY",
      "MISSING_KEY", // absent from the folder → simply not selected
    ]);

    expect(secrets).toEqual({ STRIPE_PUBLISHABLE_KEY: "pk_live" });
  });

  it("fetches the folder once via `export`, not once per key", async () => {
    const calls: string[][] = [];
    const provider = new LocalProvider({
      projectId: "proj-1",
      spawn: exportSpawn(calls, { vendor: { A: "1", B: "2", C: "3" } }),
    });

    await provider.exportKeys("development", "vendor", ["A", "B", "C"]);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("export");
    expect(calls[0]).toContain("--path=/vendor");
    expect(calls[0]).toContain("--projectId=proj-1");
  });

  it("throws a clear infrastructure error on a persistent CLI failure", async () => {
    // A transient/persistent CLI failure must surface as an error, not silently
    // drop the keys into the downstream "not produced by any folder" path.
    const provider = new LocalProvider({
      projectId: "proj-1",
      maxAttempts: 1, // avoid retry backoff sleeps in the test
      spawn: () =>
        ({
          status: 1,
          stdout: "",
          stderr: "network unreachable",
        }) as unknown as SpawnSyncReturns<string>,
    });

    await expect(
      provider.exportKeys("development", "stripe", ["STRIPE_SECRET_KEY"])
    ).rejects.toThrow(/infisical export failed/);
  });
});
