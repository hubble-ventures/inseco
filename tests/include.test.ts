import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAliases } from "../src/aliases.js";
import { enforceKnownKeys, selectEmittedSecrets } from "../src/include.js";
import { compileTree } from "../src/tree.js";

describe("enforceKnownKeys", () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
      logs.push(String(msg));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when a declared key was not produced by any folder", () => {
    expect(() => enforceKnownKeys(["MISSING"], [])).toThrow(/MISSING/);
    expect(logs).toEqual([]);
  });

  it("downgrades to a ::notice:: when the unknown key is optional", () => {
    enforceKnownKeys(["MISSING"], ["MISSING"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("::notice::");
    expect(logs[0]).toContain("MISSING");
  });

  it("fails on the non-optional unknowns even when some are downgraded", () => {
    expect(() => enforceKnownKeys(["OPT", "REQ"], ["OPT"])).toThrow(/REQ/);
  });

  it("does nothing when there are no unknowns", () => {
    expect(() => enforceKnownKeys([], [])).not.toThrow();
    expect(logs).toEqual([]);
  });
});

describe("selectEmittedSecrets", () => {
  it("emits the aliased map whole (declared keys + alias targets)", () => {
    const folders = compileTree({
      clerk: { aliased: { CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" } },
    });
    const aliased = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk" }, folders);
    const declared = folders.flatMap((f) => f.keys.map((k) => k.key));
    expect(selectEmittedSecrets(aliased, declared, [])).toEqual({
      CLERK_PUBLISHABLE_KEY: "pk",
      VITE_CLERK_PUBLISHABLE_KEY: "pk",
    });
  });

  it("throws when a declared canonical key was not produced", () => {
    const folders = compileTree({ stripe: { raw: ["STRIPE_SECRET_KEY"] } });
    const declared = folders.flatMap((f) => f.keys.map((k) => k.key));
    // The map has nothing for STRIPE_SECRET_KEY.
    expect(() => selectEmittedSecrets({}, declared, [])).toThrow(
      /STRIPE_SECRET_KEY/
    );
  });

  it("returns a fresh object", () => {
    const aliased = { A: "1" };
    const out = selectEmittedSecrets(aliased, ["A"], []);
    expect(out).not.toBe(aliased);
  });
});
