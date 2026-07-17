import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceKnownKeys } from "../src/include.js";

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
  it("dedupes a name declared-and-absent in more than one folder", () => {
    let message = "";
    try {
      enforceKnownKeys(["TOKEN", "TOKEN"], []);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message.match(/TOKEN/g)).toHaveLength(1);
  });
});
