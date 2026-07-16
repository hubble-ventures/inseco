import { describe, expect, it } from "vitest";
import { applyAliases, resolveAliases } from "../src/aliases.js";
import { loadManifestJson } from "../src/manifest.js";

describe("aliases", () => {
  it("emits a single aliased target with the source value", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: { CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" },
    });
    const out = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk_live" }, m);
    expect(out).toEqual({
      CLERK_PUBLISHABLE_KEY: "pk_live",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live",
    });
  });

  it("emits every target when given an array", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: {
        CLERK_PUBLISHABLE_KEY: [
          "VITE_CLERK_PUBLISHABLE_KEY",
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        ],
      },
    });
    const out = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk_live" }, m);
    expect(out.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_live");
    expect(out.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_live");
  });

  it("skips an absent source without creating empty targets", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: { CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" },
    });
    const out = applyAliases({ OTHER: "x" }, m);
    expect(out).toEqual({ OTHER: "x" });
  });

  it("never overwrites an existing real secret of the target name", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: { CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" },
    });
    const out = applyAliases(
      {
        CLERK_PUBLISHABLE_KEY: "pk_from_clerk",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_real",
      },
      m
    );
    expect(out.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_real");
  });

  it("does not mutate the input object", () => {
    const m = loadManifestJson({
      paths: ["clerk"],
      aliases: { CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" },
    });
    const input = { CLERK_PUBLISHABLE_KEY: "pk_live" };
    applyAliases(input, m);
    expect(input).toEqual({ CLERK_PUBLISHABLE_KEY: "pk_live" });
  });

  it("is a no-op when no aliases are declared", () => {
    const m = loadManifestJson({ paths: ["clerk"] });
    expect(resolveAliases(m)).toEqual([]);
    expect(applyAliases({ CLERK_PUBLISHABLE_KEY: "pk" }, m)).toEqual({
      CLERK_PUBLISHABLE_KEY: "pk",
    });
  });

  it("rejects an invalid target env var name at parse time", () => {
    expect(() =>
      loadManifestJson({
        paths: ["clerk"],
        aliases: { CLERK_PUBLISHABLE_KEY: "1-bad-name" },
      })
    ).toThrow();
  });

  it("rejects an invalid source env var name at parse time", () => {
    expect(() =>
      loadManifestJson({
        paths: ["clerk"],
        aliases: { "CLERK-PUBLISHABLE_KEY": "VITE_CLERK_PUBLISHABLE_KEY" },
      })
    ).toThrow();
  });
});
