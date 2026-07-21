import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDiff } from "../src/commands/diff.js";
import { runKeys } from "../src/commands/keys.js";

const fixtureRepo = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "repo"
);

/** Capture stdout (process.stdout.write) and console.log/error during `fn`. */
async function capture(fn: () => Promise<unknown>): Promise<{
  out: string;
  log: string;
  err: string;
  result: unknown;
  threw: Error | null;
}> {
  let out = "";
  let log = "";
  let err = "";
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      out += String(chunk);
      return true;
    });
  const clog = vi.spyOn(console, "log").mockImplementation((...a) => {
    log += `${a.join(" ")}\n`;
  });
  const cerr = vi.spyOn(console, "error").mockImplementation((...a) => {
    err += `${a.join(" ")}\n`;
  });
  let result: unknown = undefined;
  let threw: Error | null = null;
  try {
    result = await fn();
  } catch (e) {
    threw = e as Error;
  } finally {
    write.mockRestore();
    clog.mockRestore();
    cerr.mockRestore();
  }
  return { out, log, err, result, threw };
}

describe("runKeys (static, over fixtures)", () => {
  it("prints declared emitted names on stdout, mode note on stderr", async () => {
    const { log, err } = await capture(() =>
      runKeys({ packageId: "web", all: false, json: false, check: false, cwd: fixtureRepo })
    );
    // clerk aliases CLERK_PUBLISHABLE_KEY -> VITE_*, posthog is a plain key.
    expect(log.trim().split("\n")).toEqual([
      "CLERK_PUBLISHABLE_KEY",
      "POSTHOG_PROJECT_TOKEN",
      "VITE_CLERK_PUBLISHABLE_KEY",
    ]);
    expect(err).toContain("no vault access");
    // Names only — never a KEY=VALUE line.
    expect(log).not.toContain("=");
  });

  it("--json emits mode:static and schemaVersion, no values", async () => {
    const { out } = await capture(() =>
      runKeys({ packageId: "api", profile: "deploy", all: false, json: true, check: false, cwd: fixtureRepo })
    );
    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({ id: "api", profile: "deploy", mode: "static" });
    expect(parsed.emitted).toEqual(["CLERK_SECRET_KEY", "FLY_API_TOKEN", "STRIPE_SECRET_KEY"]);
    expect(parsed.schemaVersion).toBeTypeOf("number");
  });

  it("rejects --check without --all", async () => {
    const { threw } = await capture(() =>
      runKeys({ packageId: "web", all: false, json: false, check: true, cwd: fixtureRepo })
    );
    expect(threw?.message).toMatch(/--check requires --all/);
  });

  it("rejects --profile with --all", async () => {
    const { threw } = await capture(() =>
      runKeys({ profile: "deploy", all: true, json: false, check: false, cwd: fixtureRepo })
    );
    expect(threw?.message).toMatch(/drop --profile/);
  });
});

describe("runKeys --all --check (lockfile)", () => {
  let repo: string;
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "infisicml-keys-"));
    mkdirSync(join(repo, "apps", "web"), { recursive: true });
    writeFileSync(
      join(repo, "infisicml.config.json"),
      JSON.stringify({ projectId: "x", discovery: { roots: ["apps"] } })
    );
    writeFileSync(
      join(repo, "apps", "web", "secrets.yaml"),
      "secrets:\n  - clerk: [CLERK_SECRET_KEY]\n"
    );
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("errors when no snapshot exists", async () => {
    const { threw } = await capture(() =>
      runKeys({ all: true, json: false, check: true, cwd: repo })
    );
    expect(threw?.message).toMatch(/No infisicml\.keys\.json/);
  });

  it("passes when in sync, fails after a manifest change", async () => {
    // Generate the snapshot via the built CLI (the documented workflow).
    writeFileSync(
      join(repo, "infisicml.keys.json"),
      execFileSync("node", [cli, "keys", "--all", "--json"], { cwd: repo, encoding: "utf8" })
    );
    const ok = await capture(() => runKeys({ all: true, json: false, check: true, cwd: repo }));
    expect(ok.threw).toBeNull();
    expect(ok.log).toMatch(/in sync/);

    // Drop a key — check must now fail and name the removed key.
    writeFileSync(join(repo, "apps", "web", "secrets.yaml"), "secrets:\n  - clerk: [OTHER_KEY]\n");
    const drift = await capture(() => runKeys({ all: true, json: false, check: true, cwd: repo }));
    expect(drift.threw?.message).toMatch(/drifted/);
    expect(drift.err).toMatch(/- web \(default\): CLERK_SECRET_KEY/);
    expect(drift.err).toMatch(/\+ web \(default\): OTHER_KEY/);
  });
});

describe("runDiff", () => {
  let repo: string;
  const git = (args: string[], cwd: string) =>
    execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "infisicml-diff-"));
    mkdirSync(join(repo, "apps", "web"), { recursive: true });
    writeFileSync(
      join(repo, "infisicml.config.json"),
      JSON.stringify({ projectId: "x", discovery: { roots: ["apps"] } })
    );
    git(["init"], repo);
    git(["config", "user.email", "t@t.co"], repo);
    git(["config", "user.name", "t"], repo);
    // v1: two keys. v2: drop CLERK_SECRET_KEY (the silent-drop migration case).
    writeFileSync(
      join(repo, "apps", "web", "secrets.yaml"),
      "secrets:\n  - clerk:\n      - CLERK_PUBLISHABLE_KEY\n      - CLERK_SECRET_KEY\n"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "v1"], repo);
    writeFileSync(
      join(repo, "apps", "web", "secrets.yaml"),
      "secrets:\n  - clerk:\n      - CLERK_PUBLISHABLE_KEY\n"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "v2"], repo);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("reports the removed key across refs (names only)", async () => {
    const { out, result } = await capture(() =>
      runDiff({ packageId: "web", from: "HEAD~1", to: "HEAD", all: false, json: true, exitCode: false, cwd: repo })
    );
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toMatchObject({
      package: "web",
      profile: "(default)",
      added: [],
      removed: ["CLERK_SECRET_KEY"],
    });
    expect(out).not.toMatch(/[A-Z_]+=/); // no KEY=VALUE
    expect(result).toBe(0); // no --exit-code
  });

  it("--exit-code returns 1 when keys changed", async () => {
    const { result } = await capture(() =>
      runDiff({ packageId: "web", from: "HEAD~1", to: "HEAD", all: false, json: false, exitCode: true, cwd: repo })
    );
    expect(result).toBe(1);
  });

  it("errors on an unknown ref", async () => {
    const { threw } = await capture(() =>
      runDiff({ packageId: "web", from: "HEAD~99", to: "HEAD", all: false, json: false, exitCode: false, cwd: repo })
    );
    expect(threw?.message).toMatch(/Unknown git ref/);
  });

  it("compares two manifest files directly, no git", async () => {
    const a = join(repo, "a.yaml");
    const b = join(repo, "b.yaml");
    writeFileSync(a, "secrets:\n  - x: [A]\n");
    writeFileSync(b, "secrets:\n  - x: [A, B]\n");
    const { out } = await capture(() =>
      runDiff({ packageId: "web", from: a, to: b, all: false, json: true, exitCode: false, cwd: repo })
    );
    expect(JSON.parse(out).results[0]).toMatchObject({ added: ["B"], removed: [] });
  });
});
