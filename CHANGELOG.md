# Changelog

All notable changes to `infisicml` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-07-17

### Changed

- **Renamed the package, CLI, repo, and config from `infiscml` to `infisicml`**
  (a typo fix — the name is derived from *Infisical*). The npm package is now
  `@hubble-ventures/infisicml`, the CLI binary is `infisicml`, the repository is
  [`hubble-ventures/infisicml`](https://github.com/hubble-ventures/infisicml)
  (GitHub redirects the old URL), and the exported config type is
  `InfisicmlConfig`. The composite action input `infiscml-version` is now
  `infisicml-version`.
- **Config discovery is back-compatible.** `infisicml.config.{json,mjs,js}` is
  preferred, but the old `infiscml.config.*` filenames still resolve, so
  existing repos keep working without a rename.

## [1.2.0] - 2026-07-16

### Added

- **Least-privilege fetch (`fetch: "keys"`).** A new per-manifest `fetch` field
  (default `"folder"`) controls how secrets are read. In `"keys"` mode infisicml
  emits **only** the keys `include` resolves to. In **CI** this is enforced at
  the wire: each key is fetched with the single-secret REST endpoint
  (`GET /api/v3/secrets/raw/{name}`), so the vault never transmits the other
  keys in a folder — contrast folder mode, where `include` is a post-fetch
  filter and excluded values still travel over the wire. **Locally** the
  `infisical` CLI has no single-secret server read, so infisicml fetches each
  folder once and selects the keys (narrowing what's written, not what's
  transmitted). `include` names the final (post-alias) keys, so key mode
  **reverse-maps** each alias target to its canonical vault source before
  fetching, and import-surfaced keys still resolve. Everything after the fetch
  (aliases, `include` filtering,
  unknown-key enforcement, `optionalKeys`) is unchanged, so the emitted output
  matches folder mode. `fetch: "keys"` **requires** an `include` allowlist
  (enforced by `validate` and the pull / CI step). A per-profile `fetch`
  replaces the root one (same replace-not-merge as `paths` / `include`). Honored
  by `pull` and `export-gha`; surfaced by `list`, `paths`, and `validate`.
  Published in the exported JSON Schema. Omitting `fetch` is byte-for-byte
  backward compatible.

## [1.1.0] - 2026-07-16

### Added

- **Key-level `include` allowlist.** `secrets.json` can now emit only a chosen
  subset of the keys a folder yields (default-deny key selection), so a client
  package can pull a shared vendor folder but keep server secrets out of client
  builds and `GITHUB_ENV`. Add `include` at the manifest root and/or per profile
  (a profile's `include` replaces the root one). Applied **after** `aliases`, to
  the final set of names. An `include` key that no folder produced fails the pull
  / CI step unless it's listed in `environments.<slug>.optionalKeys` (downgraded
  to a `::notice::`). Honored by `pull`, `export-gha`, `list`, `paths`, and
  `validate`. Omitting `include` is fully backward compatible — every key is
  emitted, as before. Published in the exported JSON Schema.

## [1.0.0] - 2026-07-16

First public release. The `secrets.json` manifest contract and the
`infisicml.config` surface are now considered stable under semver — breaking
changes to either ship only in a new major.

### Added

- **Published to npm as a public scoped package** (`npm i -D @hubble-ventures/infisicml`,
  `npx --yes @hubble-ventures/infisicml@latest`). Released via npm **trusted publishing**
  (OIDC) with build provenance — no long-lived tokens.
- **Stable action ref.** `hubble-ventures/infisicml/action@v1` is a floating major
  tag that tracks the latest `v1.x`; consumers may also pin a release SHA.
- **CLI**: `pull`, `export-gha`, `list`, `validate`, `paths`, `run`.
- **Two auth lanes, one per environment.** Local dev uses the Infisical CLI user
  session (`infisical login`); CI uses **GitHub OIDC → Infisical machine
  identity** over the REST API, with no Infisical CLI in the runner.
- **Multi-target aliases.** One canonical vault key can be copied to several
  prefixed names in a single output (e.g. `GOOGLE_MAPS_API_KEY` →
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` **and** `VITE_GOOGLE_MAPS_API_KEY`). Real
  secrets of a target name always win; the operation is idempotent.
- **Per-package output filename.** `output` sets the written filename (e.g.
  `.env.local`, `.env`) next to each manifest.
- **Profiles** for deploy-only credentials — profile paths replace base paths, so
  release-time creds (e.g. `fly`) never leak into runtime output.
- **`advertiseKeys` hooks** publish runtime key *names* (never values) to
  `GITHUB_ENV` for deploy forwarding.
- **CI skip/stub** (`ci.skipWhenEnv`, `ci.stubInCi`) and **optional keys**
  (`environments.<slug>.optionalKeys`) that downgrade a missing key to a
  `::notice::` instead of failing CI.
- **Published JSON Schema** for `secrets.json`, served from
  `https://cdn.jsdelivr.net/npm/@hubble-ventures/infisicml@1/schema/secrets.schema.json`.

[1.2.1]: https://github.com/hubble-ventures/infisicml/releases/tag/v1.2.1
[1.2.0]: https://github.com/hubble-ventures/infisicml/releases/tag/v1.2.0
[1.1.0]: https://github.com/hubble-ventures/infisicml/releases/tag/v1.1.0
[1.0.0]: https://github.com/hubble-ventures/infisicml/releases/tag/v1.0.0
