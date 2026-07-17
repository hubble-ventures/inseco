import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendPlainToGithubEnv,
  appendSecretToGithubEnv,
} from "../src/github-env.js";

describe("github-env", () => {
  let tempDir: string;
  let stdout: string;
  const origWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    process.stdout.write = origWrite;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function captureStdout(): void {
    stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout +=
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
  }

  it("masks on stdout and writes multiline GITHUB_ENV entry", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gha-env-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    captureStdout();
    appendSecretToGithubEnv(envFile, "MY_KEY", "line1\nline2");
    const content = readFileSync(envFile, "utf8");
    expect(stdout).toContain("::add-mask::line1");
    expect(stdout).toContain("::add-mask::line2");
    expect(content).not.toContain("::add-mask::");
    expect(content).toMatch(/MY_KEY<<INFISICML_MY_KEY_/);
    expect(content).toContain("line1\nline2");
  });

  it("escapes percent in mask stdout", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gha-env-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    captureStdout();
    appendSecretToGithubEnv(envFile, "PCT", "100%");
    expect(stdout).toContain("::add-mask::100%25");
    expect(readFileSync(envFile, "utf8")).not.toContain("::add-mask::");
  });

  it("masks each line of multiline values containing emails", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gha-env-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    captureStdout();
    appendSecretToGithubEnv(envFile, "EMAIL", "test@example.com");
    expect(stdout).toContain("::add-mask::test@example.com");
    expect(readFileSync(envFile, "utf8")).toContain("test@example.com");
    expect(readFileSync(envFile, "utf8")).not.toContain("::add-mask::");
  });

  it("writes plain (unmasked) single-line entries", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gha-env-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    captureStdout();
    appendPlainToGithubEnv(envFile, "INFISICML_FLY_KEYS", "A,B,C");
    expect(stdout).not.toContain("::add-mask::");
    expect(readFileSync(envFile, "utf8")).toBe("INFISICML_FLY_KEYS=A,B,C\n");
  });

  it("rejects multiline plain values", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gha-env-"));
    const envFile = join(tempDir, "GITHUB_ENV");
    expect(() => appendPlainToGithubEnv(envFile, "K", "a\nb")).toThrow(
      /single-line/
    );
  });
});
