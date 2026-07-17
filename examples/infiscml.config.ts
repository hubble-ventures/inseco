import { defineConfig } from "@hubble-ventures/infiscml";

/**
 * Example infiscml.config.ts placed at your monorepo root. Infiscml finds the
 * repo root by walking up from the cwd until it sees this file.
 */
export default defineConfig({
  // Infisical project id for the local `infisical export` CLI provider.
  // Or set projectIdEnvFile / the INFISICAL_PROJECT_ID env var instead.
  projectIdEnvFile: ".env.infisical",

  // How Infiscml discovers per-package secrets.json manifests.
  discovery: {
    // Scan these parents one level deep; child dir name becomes the package id.
    roots: ["apps", "packages", "services"],
    // Explicit extras with custom ids.
    packages: [{ id: "postgres", dir: "infra/postgres" }],
  },

  // OIDC audience bound to your CI machine identity (must match Infisical).
  auth: { oidcAudience: "https://github.com/your-org" },

  // Advertise runtime key NAMES (never values) to GITHUB_ENV so a deploy step
  // forwards exactly those (e.g. `flyctl secrets import`), keeping secrets.json
  // the source of truth for what a deploy forwards.
  hooks: {
    advertiseKeys: [{ envVar: "INFISCML_FLY_KEYS", scope: "runtime" }],
  },
});
