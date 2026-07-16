import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAliases } from "../src/aliases.js";
import {
  applyInclude,
  enforceIncludeKnown,
  selectEmittedSecrets,
} from "../src/include.js";
import { loadManifestJson } from "../src/manifest.js";

describe("applyInclude", () => {
  it("emits only the allowlisted keys from a multi-key folder", () => {
    const merged = {
      STRIPE_SECRET_KEY: "sk_live",
      STRIPE_WEBHOOK_SECRET: "whsec",
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live",
    };
    const { filtered, unknown } = applyInclude(merged, [
      "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ]);
    expect(filtered).toEqual({
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live",
    });
    expect(unknown).toEqual([]);
  });

  it("is a pass-through no-op when include is undefined (backward compatible)", () => {
    const merged = { A: "1", B: "2" };
    const { filtered, unknown } = applyInclude(merged, undefined);
    expect(filtered).toEqual(merged);
    expect(unknown).toEqual([]);
  });

  it("does not mutate the input map", () => {
    const merged = { A: "1", B: "2" };
    applyInclude(merged, ["A"]);
    expect(merged).toEqual({ A: "1", B: "2" });
  });

  it("reports include names not present in the merged map as unknown", () => {
    const { filtered, unknown } = applyInclude({ A: "1" }, ["A", "MISSING"]);
    expect(filtered).toEqual({ A: "1" });
    expect(unknown).toEqual(["MISSING"]);
  });
});

describe("applyInclude + aliases ordering", () => {
  it("filters the FINAL name set: alias target survives, canonical is dropped", () => {
    // Folder yields the canonical GOOGLE_MAPS_API_KEY plus two server secrets.
    // Alias expands canonical -> EXPO_PUBLIC_* ; include allows only the public
    // name, so the canonical and the server secrets are all dropped.
    const m = loadManifestJson({
      paths: ["google"],
      aliases: { GOOGLE_MAPS_API_KEY: ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"] },
      include: ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"],
    });
    const aliased = applyAliases(
      {
        GOOGLE_MAPS_API_KEY: "AIza",
        GOOGLE_CLIENT_ID: "cid",
        GOOGLE_CLIENT_SECRET: "csecret",
      },
      m
    );
    const { filtered } = applyInclude(aliased, m.include);
    expect(filtered).toEqual({ EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "AIza" });
  });

  it("an alias whose source is not in include still emits its target", () => {
    // include names only the target, not the canonical source.
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: { CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" },
      include: ["VITE_CLERK_PUBLISHABLE_KEY"],
    });
    const aliased = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk" }, m);
    const { filtered } = applyInclude(aliased, m.include);
    expect(filtered).toEqual({ VITE_CLERK_PUBLISHABLE_KEY: "pk" });
  });
});

describe("enforceIncludeKnown", () => {
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

  it("throws when an include key was not produced by any folder", () => {
    expect(() => enforceIncludeKnown(["MISSING"], [])).toThrow(/MISSING/);
    expect(logs).toEqual([]);
  });

  it("downgrades to a ::notice:: when the unknown key is optional", () => {
    enforceIncludeKnown(["MISSING"], ["MISSING"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("::notice::");
    expect(logs[0]).toContain("MISSING");
  });

  it("fails on the non-optional unknowns even when some are downgraded", () => {
    expect(() => enforceIncludeKnown(["OPT", "REQ"], ["OPT"])).toThrow(/REQ/);
  });

  it("does nothing when there are no unknowns", () => {
    expect(() => enforceIncludeKnown([], [])).not.toThrow();
    expect(logs).toEqual([]);
  });
});

describe("selectEmittedSecrets — profile replace semantics", () => {
  const aliased = { A: "1", B: "2", C: "3" };

  it("a profile include replaces the root include", () => {
    const m = loadManifestJson({
      paths: ["x"],
      include: ["A"],
      profiles: { deploy: { paths: ["x", "y"], include: ["B"] } },
    });
    expect(selectEmittedSecrets(aliased, m, "deploy", [])).toEqual({ B: "2" });
  });

  it("a profile without include inherits the root include", () => {
    const m = loadManifestJson({
      paths: ["x"],
      include: ["A"],
      profiles: { deploy: { paths: ["x", "y"] } },
    });
    expect(selectEmittedSecrets(aliased, m, "deploy", [])).toEqual({ A: "1" });
  });

  it("emits all keys when no include is set anywhere", () => {
    const m = loadManifestJson({ paths: ["x"] });
    expect(selectEmittedSecrets(aliased, m, undefined, [])).toEqual(aliased);
  });
});
