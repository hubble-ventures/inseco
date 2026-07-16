# inseco

**In**fisical **Sec**ret **O**rchestration — federated, per-package secret manifests for monorepos, unified across local development and CI.

[Infisical](https://infisical.com) gives you a vault and the primitives to read from it (a CLI, a REST API, machine-identity auth, a GitHub Action). All of those operate on **one folder / one environment / one process at a time**. Inseco is the layer above that: it lets each package in a monorepo declare which vault folders it needs in a committed `secrets.json`, then materializes those secrets **the same way** whether you're a developer running a local pull or a CI job exporting into `GITHUB_ENV`.

> Inseco orchestrates Infisical. It stores no secrets and never sees your vault contents at rest — the vault, auth, and secret values stay in Infisical.

## Why

| Problem | Native Infisical | Inseco |
|---|---|---|
| N packages each need a different slice of the vault | Hand-write export commands per app×folder | One committed `secrets.json` per package, auto-discovered |
| Dev uses the CLI, CI uses the API | Two integrations kept in sync by hand | One `SecretsProvider` abstraction; identical downstream logic |
| Vault names a secret once, but Vite wants `VITE_*` and Next wants `NEXT_PUBLIC_*` | Each workflow re-derives the prefixed copy | Declare `aliases` once; applied in dev **and** CI |
| Skip the pull in CI when vars are already injected | Bash guards in every workflow | `ci.skipWhenEnv` / `ci.stubInCi` policy |
| A deploy needs exactly the runtime keys, not the deploy creds | Hand-maintained allowlist | `profiles` + `advertiseKeys` hook — `secrets.json` is the source of truth |

## Install

```bash
npm i -D inseco    # or pnpm add -D inseco
```

Requires the [`infisical` CLI](https://infisical.com/docs/cli/overview) for local pulls (`infisical login` once). CI needs no CLI — it uses the REST API.

## Quick start

1. Add an `inseco.config.ts` (or `.json`) at your monorepo root — this file marks the repo root:

   ```ts
   import { defineConfig } from "inseco";

   export default defineConfig({
     projectIdEnvFile: ".env.infisical", // provides INFISICAL_PROJECT_ID
     discovery: { roots: ["apps", "services"], packages: [{ id: "postgres", dir: "infra/postgres" }] },
     auth: { oidcAudience: "https://github.com/your-org" },
     hooks: { advertiseKeys: [{ envVar: "INSECO_FLY_KEYS", scope: "runtime" }] },
   });
   ```

2. Add a `secrets.json` next to each package:

   ```jsonc
   {
     "$schema": "https://hubble-ventures.github.io/inseco/secrets.schema.json",
     "paths": ["clerk", "posthog"],
     "aliases": { "CLERK_PUBLISHABLE_KEY": "VITE_CLERK_PUBLISHABLE_KEY" }
   }
   ```

3. Pull secrets into gitignored `.env.secrets` files:

   ```bash
   npx inseco pull                 # every package
   npx inseco pull web api --force # specific ids, bypass the exists-check
   npx inseco validate             # check every secrets.json against the schema
   ```

See [`examples/`](./examples) for a fuller config and manifest.

## CLI

| Command | Purpose |
|---|---|
| `pull [ids...]` | Write `.env.secrets` locally (uses `infisical export`) |
| `export-gha <id>` | Mask + append secrets to `GITHUB_ENV` (REST API + OIDC/universal auth) |
| `list` | Show every manifest and its Infisical paths |
| `validate` | Validate every `secrets.json` against the schema |
| `paths <id>` | Print resolved paths (`--comma` for scripting) |
| `run <id> -- <cmd...>` | Thin `infisical run` wrapper (prefer `pull` + `.env.secrets`) |

Common flags: `--env`, `--profile`, `--force`, `--here` (pull the cwd package), `--turbo` (always write, for Turbo caching).

## GitHub Actions

Use the bundled composite action (runs `inseco export-gha` via `npx`):

```yaml
- uses: hubble-ventures/inseco/action@v1
  with:
    package-id: api
    environment: preview
    project-slug: ${{ vars.INFISICAL_PROJECT_SLUG }}
    identity-id: ${{ vars.INFISICAL_IDENTITY_ID }}    # OIDC preferred
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}      # universal-auth fallback
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
```

Secrets are masked and appended to `GITHUB_ENV` for subsequent steps. Any configured `advertiseKeys` hook writes a plain, comma-separated list of runtime key **names** so a deploy step can forward exactly those.

## Concepts

- **Manifest (`secrets.json`)** — per package: `paths` (vault folders), optional `profiles`, `aliases`, `ci`, `environments`, `output`.
- **Profiles** — named path sets that *replace* base `paths` when `--profile` is set. Base paths are runtime secrets; profile-only paths (e.g. `fly`) are deploy/release credentials.
- **Aliases** — copy a canonical secret to extra tool-specific names. Real secrets of the target name always win; the operation is idempotent and never overwrites.
- **CI skip/stub** — `ci.skipWhenEnv` skips the pull when all listed vars are already set in CI; `ci.stubInCi` always stubs in CI. Both write a `.env.secrets` from `process.env` instead of calling Infisical.
- **Optional keys** — `environments.<slug>.optionalKeys` downgrade a missing key to a `::notice::` in `export-gha` instead of a failure.
- **Advertise-keys hooks** — publish runtime key *names* (never values) to `GITHUB_ENV` for deploy forwarding.

## Programmatic API

```ts
import { loadConfig, discoverManifests, pullManifest, LocalProvider } from "inseco";

const config = await loadConfig();
const provider = new LocalProvider({ projectId: config.projectId });
for (const manifest of discoverManifests(config)) {
  await pullManifest({ manifest, provider, repoRoot: config.repoRoot, envName: "development" });
}
```

## Design

Everything repo-specific lives in `inseco.config` — package discovery, the project-id source, the OIDC audience, and deploy-time key advertisement are all configuration, so nothing about one repo's layout is baked into the tool. The manifest contract (`secrets.json`) is the stable public interface, versioned via the [published JSON Schema](./schema/secrets.schema.json).

## License

MIT © Hubble Ventures
