import { describe, expect, it } from "vitest";
import { normalizeEnvSlug } from "../src/env-slug.js";

describe("normalizeEnvSlug", () => {
  it("maps prod to production", () => {
    expect(normalizeEnvSlug("prod")).toBe("production");
  });

  it("passes through other slugs", () => {
    expect(normalizeEnvSlug("preview")).toBe("preview");
    expect(normalizeEnvSlug("development")).toBe("development");
  });
});
