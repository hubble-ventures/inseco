import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import {
  discoverManifests,
  discoverPackages,
  loadPackage,
} from "../src/registry.js";

const fixtureRepo = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "repo"
);

describe("config + registry", () => {
  it("loads config from the nearest infisicml.config.json", async () => {
    const config = await loadConfig(fixtureRepo);
    expect(config.repoRoot).toBe(fixtureRepo);
    expect(config.projectId).toBe("fixture-project-id");
    expect(config.auth?.oidcAudience).toBe("https://example.com/org");
  });

  it("discovers roots + explicit packages, sorted by id", async () => {
    const config = await loadConfig(fixtureRepo);
    const manifests = discoverManifests(config);
    expect(manifests.map((m) => m.id)).toEqual(["api", "postgres", "web"]);
  });

  it("discovers YAML and JSON manifests side by side", async () => {
    const config = await loadConfig(fixtureRepo);
    const manifests = discoverManifests(config);
    const byId = Object.fromEntries(manifests.map((m) => [m.id, m.file]));
    // web/secrets.yaml (YAML primary) and api/secrets.json (JSON supported).
    expect(byId.web.format).toBe("yaml");
    expect(byId.web.filename).toBe("secrets.yaml");
    expect(byId.api.format).toBe("json");
    expect(byId.api.filename).toBe("secrets.json");
  });

  it("derives package id from the roots child directory name", async () => {
    const config = await loadConfig(fixtureRepo);
    const web = discoverManifests(config).find((m) => m.id === "web");
    const secrets = web?.config.secrets ?? [];
    // Each top-level entry is a { folderName: [...] } object.
    expect(secrets.map((f) => Object.keys(f)[0])).toEqual(["clerk", "posthog"]);
    // clerk's contents array holds one alias object: CLERK_PUBLISHABLE_KEY -> VITE_*
    const clerkContents = (secrets[0] as Record<string, unknown[]>).clerk;
    const clerkAlias = clerkContents[0] as Record<string, string>;
    expect(clerkAlias.CLERK_PUBLISHABLE_KEY).toBe("VITE_CLERK_PUBLISHABLE_KEY");
  });

  it("finds config by walking up from a nested cwd", async () => {
    const config = await loadConfig(join(fixtureRepo, "apps", "web"));
    expect(config.repoRoot).toBe(fixtureRepo);
  });

  describe("ambiguity is scoped to the package that's loaded", () => {
    let repo: string;
    let config: ResolvedConfig;
    beforeEach(() => {
      // apps/web is healthy (one manifest); apps/legacy is ambiguous (two).
      repo = mkdtempSync(join(tmpdir(), "infisicml-repo-"));
      mkdirSync(join(repo, "apps", "web"), { recursive: true });
      mkdirSync(join(repo, "apps", "legacy"), { recursive: true });
      writeFileSync(
        join(repo, "apps", "web", "secrets.yaml"),
        "secrets:\n  - clerk: [K]\n"
      );
      writeFileSync(
        join(repo, "apps", "legacy", "secrets.yaml"),
        "secrets:\n  - a: [K]\n"
      );
      writeFileSync(
        join(repo, "apps", "legacy", "secrets.json"),
        JSON.stringify({ secrets: [{ a: ["K"] }] })
      );
      config = {
        repoRoot: repo,
        projectId: "x",
        discovery: { roots: ["apps"] },
      };
    });
    afterEach(() => rmSync(repo, { recursive: true, force: true }));

    it("discoverPackages enumerates both without throwing on the ambiguous one", () => {
      expect(discoverPackages(config).map((p) => p.id)).toEqual([
        "legacy",
        "web",
      ]);
    });

    it("loadPackage(web) succeeds even though a sibling is ambiguous", () => {
      const web = discoverPackages(config).find((p) => p.id === "web");
      expect(loadPackage(web!).config.secrets).toHaveLength(1);
    });

    it("loadPackage(legacy) throws only when legacy is actually loaded", () => {
      const legacy = discoverPackages(config).find((p) => p.id === "legacy");
      expect(() => loadPackage(legacy!)).toThrow(/[Aa]mbiguous/);
    });

    it("discoverManifests (loads all) surfaces the ambiguous member", () => {
      expect(() => discoverManifests(config)).toThrow(/[Aa]mbiguous/);
    });
  });
});
