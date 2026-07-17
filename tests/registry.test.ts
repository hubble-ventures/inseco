import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { discoverManifests } from "../src/registry.js";

const fixtureRepo = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "repo"
);

describe("config + registry", () => {
  it("loads config from the nearest infiscml.config.json", async () => {
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

  it("derives package id from the roots child directory name", async () => {
    const config = await loadConfig(fixtureRepo);
    const web = discoverManifests(config).find((m) => m.id === "web");
    expect(web?.config.paths).toEqual(["clerk", "posthog"]);
    expect(web?.config.aliases?.CLERK_PUBLISHABLE_KEY).toBe(
      "VITE_CLERK_PUBLISHABLE_KEY"
    );
  });

  it("finds config by walking up from a nested cwd", async () => {
    const config = await loadConfig(join(fixtureRepo, "apps", "web"));
    expect(config.repoRoot).toBe(fixtureRepo);
  });
});
