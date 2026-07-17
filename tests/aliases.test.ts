import { describe, expect, it } from "vitest";
import { applyAliases, resolveAliases } from "../src/aliases.js";
import { compileTree } from "../src/tree.js";

describe("aliases", () => {
  it("emits a single aliased target with the source value", () => {
    const folders = compileTree({
      clerk: [{ CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" }],
    });
    const out = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk_live" }, folders);
    expect(out).toEqual({
      CLERK_PUBLISHABLE_KEY: "pk_live",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live",
    });
  });

  it("emits every target when given an array", () => {
    const folders = compileTree({
      clerk: [
        {
          CLERK_PUBLISHABLE_KEY: [
            "VITE_CLERK_PUBLISHABLE_KEY",
            "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
          ],
        },
      ],
    });
    const out = applyAliases({ CLERK_PUBLISHABLE_KEY: "pk_live" }, folders);
    expect(out.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_live");
    expect(out.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_live");
  });

  it("skips an absent source without creating empty targets", () => {
    const folders = compileTree({
      clerk: [{ CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" }],
    });
    const out = applyAliases({ OTHER: "x" }, folders);
    expect(out).toEqual({ OTHER: "x" });
  });

  it("never overwrites an existing real secret of the target name", () => {
    const folders = compileTree({
      clerk: [{ CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" }],
    });
    const out = applyAliases(
      {
        CLERK_PUBLISHABLE_KEY: "pk_from_clerk",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_real",
      },
      folders
    );
    expect(out.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_real");
  });

  it("does not mutate the input object", () => {
    const folders = compileTree({
      clerk: [{ CLERK_PUBLISHABLE_KEY: "VITE_CLERK_PUBLISHABLE_KEY" }],
    });
    const input = { CLERK_PUBLISHABLE_KEY: "pk_live" };
    applyAliases(input, folders);
    expect(input).toEqual({ CLERK_PUBLISHABLE_KEY: "pk_live" });
  });

  it("is a no-op when no aliases are declared", () => {
    const folders = compileTree({ clerk: ["CLERK_PUBLISHABLE_KEY"] });
    expect(resolveAliases(folders)).toEqual([]);
    expect(applyAliases({ CLERK_PUBLISHABLE_KEY: "pk" }, folders)).toEqual({
      CLERK_PUBLISHABLE_KEY: "pk",
    });
  });

  it("collects aliases across folders (with provenance)", () => {
    const folders = compileTree({
      clerk: [{ CLERK_PUBLISHABLE_KEY: "VITE_CLERK" }],
      posthog: [{ POSTHOG_PROJECT_TOKEN: ["VITE_PH", "NEXT_PH"] }],
    });
    expect(resolveAliases(folders)).toEqual([
      { source: "CLERK_PUBLISHABLE_KEY", targets: ["VITE_CLERK"] },
      { source: "POSTHOG_PROJECT_TOKEN", targets: ["VITE_PH", "NEXT_PH"] },
    ]);
  });
});
