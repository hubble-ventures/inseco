# infisicml

**Infisical Secret Orchestration** — federated, per-package secret manifests for monorepos, unified across local development and CI.

[Infisical](https://infisical.com) gives you a vault and the primitives to read from it (a CLI, a REST API, machine-identity auth, a GitHub Action). All of those operate on **one folder / one environment / one process at a time**. Infisicml is the layer above that: it lets each package in a monorepo declare which vault folders it needs in a committed manifest (`secrets.yaml`, or `secrets.json`), then materializes those secrets **the same way** whether you're a developer running a local pull or a CI job exporting into `GITHUB_ENV`.

> Infisicml orchestrates Infisical. It stores no secrets and never sees your vault contents at rest — the vault, auth, and secret values stay in Infisical.

## Why

| Problem | Native Infisical | Infisicml |
|---|---|---|
| N packages each need a different slice of the vault | Hand-write export commands per app×folder | One committed manifest (`secrets.yaml`/`.json`) per package, auto-discovered |
| Dev uses the CLI, CI uses the API | Two integrations kept in sync by hand | One `SecretsProvider` abstraction; identical downstream logic |
| Vault names a secret once, but Vite wants `VITE_*` and Next wants `NEXT_PUBLIC_*` | Each workflow re-derives the prefixed copy | Declare `aliases` once; applied in dev **and** CI |
| Skip the pull in CI when vars are already injected | Bash guards in every workflow | `ci.skipWhenEnv` / `ci.stubInCi` policy |
| A deploy needs exactly the runtime keys, not the deploy creds | Hand-maintained allowlist | `profiles` + `advertiseKeys` hook — the manifest is the source of truth |
| A client must read a shared vendor folder without ever receiving its server secrets | Split the vault or accept over-fetch | `fetch: "keys"` requests only the named keys — the vault never transmits the rest |

## Install

```bash
npm i -D @hubble-ventures/infisicml    # or pnpm add -D @hubble-ventures/infisicml
```

Requires the [`infisical` CLI](https://infisical.com/docs/cli/overview) for local pulls (`infisical login` once). CI needs no CLI — it uses the REST API.

## Quick start

1. Add an `infisicml.config.ts` (or `.json`) at your monorepo root — this file marks the repo root:

   ```ts
   import { defineConfig } from "@hubble-ventures/infisicml";

   export default defineConfig({
     projectIdEnvFile: ".env.infisical", // provides INFISICAL_PROJECT_ID
     discovery: { roots: ["apps", "services"], packages: [{ id: "postgres", dir: "infra/postgres" }] },
     auth: { oidcAudience: "https://github.com/your-org" },
     hooks: { advertiseKeys: [{ envVar: "INFISICML_FLY_KEYS", scope: "runtime" }] },
   });
   ```

2. Add a `secrets.yaml` next to each package (YAML is the primary format;
   `secrets.json` is equally supported — see the note below). `secrets` is an
   **array of folders** mirroring your Infisical structure; each folder is
   `name: [ ...contents ]`. Inside a folder's array, a **bare string** is a
   plain key, an entry with a **string value** `SOURCE: TARGET` is an alias, and
   an entry with an **array value** `sub: [ ... ]` is a subfolder. Every emitted
   key is named (default-deny; there is no wildcard).

   ```yaml
   # yaml-language-server: $schema=https://cdn.jsdelivr.net/npm/@hubble-ventures/infisicml@2/schema/secrets.schema.json
   output: .env # written next to this manifest; defaults to .env.secrets
   secrets:
     # Canonical vault key → the prefixed name a build tool expects.
     - clerk:
         - CLERK_PUBLISHABLE_KEY: VITE_CLERK_PUBLISHABLE_KEY
     # Fan one canonical key out to several prefixes: repeat the alias, one
     # target each (an array value would mean a subfolder, not multi-target).
     - google:
         - GOOGLE_MAPS_API_KEY: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
         - GOOGLE_MAPS_API_KEY: VITE_GOOGLE_MAPS_API_KEY
     - posthog:
         - POSTHOG_PROJECT_TOKEN
         # A real Infisical subfolder at /posthog/eu.
         - eu:
             - POSTHOG_EU_HOST
   ```

   An alias entry emits **both** its canonical name and the target. Keys you
   don't name are never pulled, so a client package can share a vendor folder yet
   emit only the public key — the server secret is simply undeclared.

   > **Format:** each package's manifest may be `secrets.yaml`, `secrets.yml`, or
   > `secrets.json` — the same schema either way. YAML is the default and reads
   > best for hand-authored manifests; JSON is handy for generated ones. If a
   > directory has more than one, `secrets.yaml` wins. See
   > [`examples/secrets.yaml`](./examples/secrets.yaml) and
   > [`examples/secrets.json`](./examples/secrets.json) for the same manifest in
   > both formats.

3. Pull secrets into gitignored `.env.secrets` files:

   ```bash
   npx infisicml pull                 # every package
   npx infisicml pull web api --force # specific ids, bypass the exists-check
   npx infisicml validate             # check every manifest against the schema
   ```

See [`examples/`](./examples) for a fuller config and manifest.

## CLI

| Command | Purpose |
|---|---|
| `pull [ids...]` | Write `.env.secrets` locally (uses `infisical export`) |
| `export-gha <id>` | Mask + append secrets to `GITHUB_ENV` (REST API + GitHub OIDC) |
| `list` | Show every manifest's folder tree and declared keys |
| `validate` | Validate every manifest against the schema |
| `paths <id>` | Print resolved folder paths (`--comma` for scripting) |
| `run <id> -- <cmd...>` | Thin `infisical run` wrapper (prefer `pull` + `.env.secrets`) |

Common flags: `--env`, `--profile`, `--force`, `--here` (pull the cwd package), `--turbo` (always write, for Turbo caching).

## Authentication

Infisicml supports exactly one auth lane per environment — no secrets to rotate, no fallbacks to reason about:

| Where | How | Requires |
|---|---|---|
| **Local dev** | Infisical CLI **user login** (`infisical login`) | `infisical` CLI, logged in as you |
| **CI (GitHub Actions)** | **GitHub OIDC** → Infisical machine identity | `permissions: id-token: write` + an Infisical machine identity with a GitHub OIDC auth method |

There is no client-id/secret (universal-auth) path and no long-lived token anywhere.

## GitHub Actions

Use the bundled composite action (runs `infisicml export-gha` via `npx`). The calling job **must** grant `id-token: write` so the runner can mint an OIDC token:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # REQUIRED — OIDC is the only CI auth lane
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: hubble-ventures/infisicml/action@v1
        with:
          package-id: api
          environment: production
          project-slug: ${{ vars.INFISICAL_PROJECT_SLUG }}
          identity-id: ${{ vars.INFISICAL_IDENTITY_ID }}
          oidc-audience: ${{ vars.INFISICAL_OIDC_AUDIENCE }} # optional
```

Secrets are masked and appended to `GITHUB_ENV` for subsequent steps. Any configured `advertiseKeys` hook writes a plain, comma-separated list of runtime key **names** so a deploy step can forward exactly those. A full CI + deploy example is in [`examples/github-actions.yml`](./examples/github-actions.yml).

**Pinning the action.** `@v1` is a floating major tag that always points at the latest `v1.x` release — it moves forward on each release but never across a breaking major. For a fully immutable pin, use a release SHA instead: `uses: hubble-ventures/infisicml/action@<sha>`. The action shells out to `npx --yes @hubble-ventures/infisicml@latest`; pin the package too by passing `infisicml-version:` (e.g. the same `1.x` version) if you want the CLI locked as well.

## Local development

Log in once as yourself; infisicml shells out to `infisical export` under your session:

```bash
infisical login          # authenticate as you
npx infisicml pull          # write .env.secrets next to every manifest
```

Load `.env.secrets` however your dev runtime already loads env files. See [`examples/local-dev.md`](./examples/local-dev.md) for package-script and task-runner wiring.

## Concepts

- **Manifest (`secrets.yaml` or `secrets.json`)** — per package: `secrets` (an array of folders → keys), optional `profiles`, `fetch`, `ci`, `environments`, `output`. YAML is the default format; JSON is equally supported. When a directory has both, `secrets.yaml` wins.
- **Output file** — `output` sets the written filename (default `.env.secrets`), placed **next to the manifest**. Because each package owns its own manifest, this gives a distinct file per package: a root manifest with `"output": ".env.local"` writes the repo-root `.env.local`; a manifest in `apps/backend` with `"output": ".env"` writes `apps/backend/.env`. `output` is a filename only (no path separators) — to target a different directory, place the manifest in that directory.
- **Secrets tree** — an **array of folders** mirroring your Infisical vault; each folder is `name: [ ...contents ]`. Inside the array: a bare string is a plain key, a mapping with a string value `SOURCE: TARGET` is an alias, and a mapping with an array value `sub: [ ... ]` is a real subfolder. Every emitted key is named — there is no wildcard, so a folder never leaks a key you didn't declare (default-deny). See [Key selection](#key-selection-the-tree-is-the-allowlist) below.
- **Profiles** — named alternate trees that *replace* the base `secrets` when `--profile` is set. The base tree is runtime secrets; a profile can add deploy/release folders (e.g. `fly`).
- **Aliases** — an alias entry `SOURCE: TARGET` maps a canonical vault key to one target. To fan a single key out to every framework prefix (`EXPO_PUBLIC_*`, `VITE_*`, `NEXT_PUBLIC_*`), repeat the entry — one target each (an array value means a subfolder). Both the canonical name and each target are emitted. Real secrets of a target name always win; the operation is idempotent and never overwrites.
- **Fetch mode** — `fetch: "keys"` requests only the declared keys, so the vault never transmits the rest (wire-level least privilege). Default `"folder"` reads whole folders and selects the declared keys locally. See [Wire-level least privilege](#wire-level-least-privilege-fetch-keys) below.
- **CI skip/stub** — `ci.skipWhenEnv` skips the pull when all listed vars are already set in CI; `ci.stubInCi` always stubs in CI. Both write a `.env.secrets` from `process.env` instead of calling Infisical.
- **Optional keys** — `environments.<slug>.optionalKeys` downgrade a missing declared key to a `::notice::` instead of a failure.
- **Advertise-keys hooks** — publish runtime key *names* (never values) to `GITHUB_ENV` for deploy forwarding.

### Key selection (the tree is the allowlist)

Vaults are often organized by **vendor, not by access scope** — a single `/stripe` folder
holds both a server secret and a client-public key:

```
/stripe → STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY
```

A web/mobile client needs **only** the publishable key. Because the tree is default-deny, you
name that one key and nothing else is pulled — `STRIPE_SECRET_KEY` is simply never declared,
so it can't reach a Vite/Expo client build's env (or, via the CI action, `GITHUB_ENV`).

```yaml
# apps/web/secrets.yaml — a client package
secrets:
  - stripe:
      - STRIPE_PUBLISHABLE_KEY: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - google:
      - GOOGLE_MAPS_API_KEY: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  - vercel:
      - VERCEL_AUTOMATION_BYPASS_SECRET
```

The written `.env.secrets` (and, in CI, `GITHUB_ENV`) contains **only** the declared keys and
their alias targets — server secrets in the same folders are never emitted.

- **Provenance** — a key is emitted from the folder it's declared under, and only that folder.
  Selection is per-folder, so the same name in two folders doesn't cross-contaminate.
- **Alias emits both names** — an alias entry copies the canonical key to its target; *both*
  the canonical name and the target land in the output. (To emit only a prefixed name, don't
  declare the canonical one — but the canonical publishable key is usually harmless.)
- **Unknown keys** — a declared key that its folder didn't produce is an error (fail the pull /
  CI step), **unless** it's in `environments.<slug>.optionalKeys`, which downgrades it to a
  `::notice::`. Enforced the same way in `pull` and `export-gha`.
- **Profiles** — a profile supplies its own `secrets`, which **replaces** the root tree for that
  profile.

### Wire-level least privilege (`fetch: "keys"`)

By default (`fetch: "folder"`) infisicml pulls each whole folder, then selects the declared
keys before writing the output. The undeclared values still travel over the wire into your
machine / the CI runner — they're just never written to `.env` or `GITHUB_ENV`. For most
setups that's fine. When you need the vault to **not even transmit** the secrets you don't
use, set `fetch: "keys"`:

```yaml
# apps/web/secrets.yaml — client package, strict wire-level least privilege
fetch: keys
secrets:
  - stripe:
      - STRIPE_PUBLISHABLE_KEY: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - google:
      - GOOGLE_MAPS_API_KEY
```

In `keys` mode infisicml reads **only** the declared keys. Where the guarantee bites depends on
the lane:

- **CI (`export-gha`)** — true **wire-level** least privilege: each key is fetched with the
  single-secret REST endpoint (`GET /api/v3/secrets/raw/{name}`), so the other keys in
  `/stripe` and `/google` are **never sent by the vault**. This is the security-critical lane
  (shared runners, `GITHUB_ENV`).
- **Local (`pull`)** — the `infisical` CLI has no single-secret *server* read (`secrets get`
  pulls the whole folder and filters client-side), so locally infisicml fetches each folder
  once and selects the keys. It narrows what's **written to disk**, not what the vault
  transmits — on your own machine, where folder mode already lands.

- **No allowlist needed** — the tree already names every canonical key (an alias entry's key
  *is* the real vault key), so `keys` mode requests exactly those names directly — no reverse
  mapping, and `keys` is always satisfiable.
- **Imports still resolve** — a key surfaced into a folder via an Infisical import is fetched in
  `keys` mode too (the per-key read follows imports but returns only that one secret), so
  enabling `keys` never silently drops an import-backed key.
- **Same emit result** — everything after the fetch (aliases, unknown-key enforcement,
  `optionalKeys`) is identical to folder mode; only what's read narrows.
- **Cost** — in CI, one request **per key** instead of one per folder; the folder list becomes
  advisory (`infisicml paths` notes this).
- **Profiles** — a profile may set its own `fetch`, which **replaces** the root value. A deploy
  profile can stay in `folder` mode while the runtime default is `keys`, or vice versa.

### Non-secret defaults (`.env.sample`)

Infisicml writes **only the secret slice** it pulls from Infisical — it does not merge a
committed base file. If a package keeps non-secret defaults and structure in a
`.env.sample`, keep both files and load them together at runtime, secrets last so they
win:

```bash
# node — later --env-file overrides earlier ones
node --env-file=.env.sample --env-file=.env.secrets server.js
```

```jsonc
// package.json
{ "scripts": { "dev": "infisicml --here pull && node --env-file=.env.sample --env-file=.env.secrets server.js" } }
```

Point `output` at whatever filename your loader expects (e.g. `.env` layered over a
committed `.env.example`). Do **not** overwrite a committed sample with the pulled file
— they are separate inputs, and losing the sample's defaults would break local dev.

## Programmatic API

```ts
import { loadConfig, discoverManifests, pullManifest, LocalProvider } from "@hubble-ventures/infisicml";

const config = await loadConfig();
const provider = new LocalProvider({ projectId: config.projectId });
for (const manifest of discoverManifests(config)) {
  await pullManifest({ manifest, provider, repoRoot: config.repoRoot, envName: "development" });
}
```

## Releasing

**Releases are automatic — you don't tag anything.** Bump the version in a PR
and merging it to `main` cuts the release:

```bash
npm run release -- minor    # or patch / major / 2.1.0 — bumps package.json + rebuilds dist
# edit CHANGELOG.md: add the new version's section
git commit -am "release: v2.1.0"
# open a PR, merge it → release fires
```

On the push to `main`, [`.github/workflows/release.yml`](./.github/workflows/release.yml)
reads `package.json`; if that version isn't tagged yet it builds + tests, **creates and
pushes the `vX.Y.Z` tag**, publishes to npm via **trusted publishing** (OIDC — no
`NPM_TOKEN` secret, provenance attached automatically), creates a GitHub Release from the
matching [`CHANGELOG.md`](./CHANGELOG.md) section, and moves the floating major tag (e.g.
`v2`). A main push that doesn't bump the version is a no-op, and the publish step is
idempotent — a version already on npm is skipped. Manually pushing a `vX.Y.Z` tag still
works if you ever need it.

> **First publish (one time).** The `@hubble-ventures` npm **organization** must exist,
> and npm trusted publishing can only be configured against an *existing* package — so
> the very first publish is done locally, by a member of the org with publish rights, to
> create the package:
>
> ```bash
> npm publish --access public   # scoped packages default to private; --access public is required
> ```
>
> (`publishConfig.access: public` in `package.json` enforces this even if the flag is
> omitted.) Then, in the package's npm settings, add a **trusted publisher** for
> `hubble-ventures/infisicml` → workflow `release.yml`, with **no environment** (the release
> job sets none — the OIDC claims must match). Every subsequent version bump merged to
> `main` publishes automatically with no token.

## Design

Everything repo-specific lives in `infisicml.config` — package discovery, the project-id source, the OIDC audience, and deploy-time key advertisement are all configuration, so nothing about one repo's layout is baked into the tool. The manifest contract (`secrets.yaml` or `secrets.json`) is the stable public interface, versioned via the [published JSON Schema](./schema/secrets.schema.json).

## License

MIT © Hubble Ventures
