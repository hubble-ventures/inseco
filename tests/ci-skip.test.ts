import { describe, expect, it } from "vitest";
import {
  isCi,
  keysForCiStub,
  shouldSkipInfisicalPull,
} from "../src/ci-skip.js";
import { loadManifestJson } from "../src/manifest.js";

describe("ci-skip", () => {
  const withSkipWhen = loadManifestJson({
    paths: ["clerk"],
    ci: { skipWhenEnv: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
  });

  const withStub = loadManifestJson({
    paths: ["clerk"],
    ci: { stubInCi: true },
  });

  it("isCi detects CI env", () => {
    const prev = process.env.CI;
    process.env.CI = "true";
    expect(isCi()).toBe(true);
    process.env.CI = prev;
  });

  it("skipWhenEnv skips when all keys present in CI", () => {
    const prevCi = process.env.CI;
    const prevKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CI = "true";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
    expect(shouldSkipInfisicalPull(withSkipWhen, false)).toBe(true);
    process.env.CI = prevCi;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevKey;
  });

  it("skipWhenEnv does not skip when key missing", () => {
    const prevCi = process.env.CI;
    const prevKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CI = "true";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    expect(shouldSkipInfisicalPull(withSkipWhen, false)).toBe(false);
    process.env.CI = prevCi;
    if (prevKey !== undefined) {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevKey;
    }
  });

  it("stubInCi skips in CI", () => {
    const prevCi = process.env.CI;
    process.env.CI = "true";
    expect(shouldSkipInfisicalPull(withStub, false)).toBe(true);
    process.env.CI = prevCi;
  });

  it("force never skips", () => {
    const prevCi = process.env.CI;
    process.env.CI = "true";
    expect(shouldSkipInfisicalPull(withStub, true)).toBe(false);
    process.env.CI = prevCi;
  });

  it("keysForCiStub returns skipWhenEnv keys", () => {
    expect(keysForCiStub(withSkipWhen)).toEqual([
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    ]);
  });
});
