import { describe, expect, it } from "vitest";
import { parseDotenv, serializeDotenv } from "../src/dotenv.js";

describe("dotenv", () => {
  it("parses simple key=value pairs", () => {
    expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips comments and blank lines", () => {
    expect(parseDotenv("# comment\n\nKEY=value")).toEqual({ KEY: "value" });
  });

  it("parses quoted values", () => {
    expect(parseDotenv('KEY="hello world"')).toEqual({ KEY: "hello world" });
  });

  it("serializes values needing quotes", () => {
    const out = serializeDotenv({ KEY: "hello world" });
    expect(out).toBe('KEY="hello world"\n');
  });

  it("round-trips simple values", () => {
    const original = { A: "1", B: "two" };
    expect(parseDotenv(serializeDotenv(original))).toEqual(original);
  });
});
