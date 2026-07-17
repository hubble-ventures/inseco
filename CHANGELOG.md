# Changelog

All notable changes to `infiscml` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
`infiscml.config` surface are now considered stable under semver — breaking
changes to either ship only in a new major.

### Added

- **Published to npm as a public scoped package** (`npm i -D @hubble-ventures/infiscml`,
  `npx --yes @hubble-ventures/infiscml@latest`). Released via npm **trusted publishing**
  (OIDC) with build provenance — no long-lived tokens.
- **Stable action ref.** `hubble-ventures/infiscml/action@v1` is a floating major
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
  `https://cdn.jsdelivr.net/npm/@hubble-ventures/infiscml@1/schema/secrets.schema.json`.

[1.1.0]: https://github.com/hubble-ventures/infiscml/releases/tag/v1.1.0
[1.0.0]: https://github.com/hubble-ventures/infiscml/releases/tag/v1.0.0
