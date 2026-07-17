import { describe, expect, it } from "vitest";
import { computeAdvertiseKeys } from "../src/commands/export-gha.js";
import { compileTree } from "../src/tree.js";

describe("computeAdvertiseKeys — runtime/deploy classification", () => {
  it("classifies by (path, key): a deploy-only key in a shared folder is NOT runtime", () => {
    // Base tree: app declares RUNTIME_KEY. Deploy profile reuses the `app`
    // folder path and adds DEPLOY_TOKEN. DEPLOY_TOKEN must not be advertised as
    // a runtime key even though its folder path is also a runtime folder.
    const base = compileTree({ app: { raw: ["RUNTIME_KEY"] } });
    const all = compileTree({ app: { raw: ["RUNTIME_KEY", "DEPLOY_TOKEN"] } });
    const emitted = { RUNTIME_KEY: "r", DEPLOY_TOKEN: "d" };

    const { runtimeKeys, allKeys } = computeAdvertiseKeys(all, base, emitted);
    expect(runtimeKeys).toEqual(["RUNTIME_KEY"]);
    expect(allKeys.sort()).toEqual(["DEPLOY_TOKEN", "RUNTIME_KEY"]);
  });

  it("a folder path absent from the base tree is entirely deploy-only", () => {
    const base = compileTree({ app: { raw: ["RUNTIME_KEY"] } });
    const all = compileTree({
      app: { raw: ["RUNTIME_KEY"] },
      fly: { raw: ["FLY_API_TOKEN"] },
    });
    const emitted = { RUNTIME_KEY: "r", FLY_API_TOKEN: "t" };

    const { runtimeKeys, allKeys } = computeAdvertiseKeys(all, base, emitted);
    // FLY_API_TOKEN is deploy-only (its folder isn't in the base tree)...
    expect(runtimeKeys).toEqual(["RUNTIME_KEY"]);
    expect(runtimeKeys).not.toContain("FLY_API_TOKEN");
    // ...but it IS in the full advertise set.
    expect(allKeys.sort()).toEqual(["FLY_API_TOKEN", "RUNTIME_KEY"]);
  });

  it("never advertises a name that isn't in the emitted job env", () => {
    const base = compileTree({ app: { raw: ["RUNTIME_KEY", "MAYBE_ABSENT"] } });
    const all = base;
    // MAYBE_ABSENT was declared optional and not produced — not in `emitted`.
    const { runtimeKeys, allKeys } = computeAdvertiseKeys(all, base, {
      RUNTIME_KEY: "r",
    });
    expect(runtimeKeys).toEqual(["RUNTIME_KEY"]);
    expect(allKeys).toEqual(["RUNTIME_KEY"]);
  });

  it("with no profile, every declared key is runtime", () => {
    const tree = compileTree({
      app: { raw: ["A"] },
      vendor: { aliased: { B: "B_PUBLIC" } },
    });
    const { runtimeKeys } = computeAdvertiseKeys(tree, tree, {
      A: "1",
      B: "2",
      B_PUBLIC: "2",
    });
    // Canonical (pre-alias) names only; alias target B_PUBLIC is not advertised.
    expect(runtimeKeys.sort()).toEqual(["A", "B"]);
  });
});
