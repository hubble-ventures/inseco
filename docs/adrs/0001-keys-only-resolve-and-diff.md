# ADR 0001 — Keys-only resolve (`keys`) and key-set diff (`diff`)

- **Status:** Accepted — implemented in 2.2.0
- **Date:** 2026-07-21
- **Issue:** [#10](https://github.com/hubble-ventures/infisicml/issues/10)
- **Target version:** 2.2.0 (additive, non-breaking)
- **Deciders:** Hubble Ventures

## Context

Infisicml's manifests are the declared source of truth for which vault keys each
package emits. But there is no supported way to answer the review-critical
question **"which key *names* does this manifest emit?"** — or its diff form,
**"did any manifest silently stop emitting a key it emitted before?"** — without
actually pulling secrets.

Verifying the `1.2.1 → 2.1.0` migration (a default-deny rewrite across 13
manifests, ~10 profiles, 3 envs) required a hand-rolled script: `git worktree`
each ref, run `pull` for every `(package, profile, env)`, parse the left-hand
identifiers out of the materialized `.env.secrets`, then `rm` it. This works but
is awkward, and — the real wart — it **fetches and writes real secret values to
disk purely to read key names**, so it can't safely run in untrusted CI, be
logged, or be pasted into a PR.

### Enabling observation

The emitted **name** set is fully computable **offline, with no vault access and
no values**. In the v2 default-deny model every emitted key is enumerated in the
manifest. `resolveCompiledFolders()` (`src/manifest.ts`) already flattens the
tree into `CompiledFolder[]`, and each `CompiledKey` (`src/tree.ts`) carries its
canonical name plus alias targets. The emitted name set is therefore just:

> for every folder, every `key.key` plus every entry in `key.aliases`, deduped.

No provider, no auth, no file write. The missing capability is a command that
**stops before fetching values** — a small gap, not an architectural one.

A corollary that shapes the whole design: static emitted **names do not depend on
`--env`**. The environment affects secret *values* and whether a missing key is
*fatal* (`optionalKeys`), never which names are *declared*. Static resolution is
therefore a pure function of `(manifest, profile)`.

## Decision

Add two additive, value-free commands, plus a committable snapshot/lockfile.

### `keys` — static keys-only resolve (Phase 1)

```
infisicml keys <id> [--profile NAME] [--json]
infisicml keys --all [--json]        # snapshot of every package × profile
infisicml keys --all --check         # lockfile drift gate (CI, no vault access)
```

- New pure module `src/keys.ts`: `emittedKeyNames(folders: CompiledFolder[]): string[]`
  (dedup + sort). No I/O, no provider.
- New `src/commands/keys.ts`, structured like `src/commands/list.ts`:
  `loadConfig` → `discoverPackages`/`loadPackage` → `resolveCompiledFolders(profile)`
  → names → text or `--json`.
- `--all` walks every package × every declared profile into a snapshot object;
  `--check` recomputes and compares against a committed `infisicml.keys.json`,
  exiting non-zero on any drift.
- Wire into `src/cli.ts` dispatch and `USAGE`.
- **No new dependencies, no auth.**

### `diff` — key-set diff across refs (Phase 2)

```
infisicml diff <id> --from <ref|file> --to <ref|file> [--profile NAME]
infisicml diff --from origin/main --to HEAD --all
```

- Read a manifest's content at a git ref with `git show <ref>:<relpath>` (via
  `node:child_process`) — **no worktree, no checkout, no value fetch.** Parse
  in-memory, `resolveCompiledFolders`, set-diff → `added` / `removed` per
  `(package, profile)`.
- `--from` / `--to` also accept a plain file path, to compare two manifests
  directly.
- Mechanically this is `keys` run twice, so it lands cheaply once Phase 1 exists.

### Explicitly rejected: a live (vault-resolved) mode

An earlier option added `keys <id> --live [--env ENV]` that authenticated,
resolved whole-folder membership, and reported names only. **We will not build
it.** It only adds value for v1-style whole-folder wildcards, which v2's
default-deny model has eliminated — every key is already enumerated, so the
static path is exact for our manifests. A live mode would reintroduce auth,
network, and a values-adjacent code path for no gain against the actual manifest
format. If a genuine whole-folder use case ever reappears, this ADR should be
superseded rather than amended.

## Rollout

1. **Phase 1 — `keys` + snapshot/lockfile.** Closes migration verification, code
   review, and CI drift for default-deny manifests with zero vault access.
2. **Phase 2 — `diff`.** Removes the worktree + dual-`pull` + `comm` workaround
   entirely.

Naming rationale: `keys` (not `pull --dry-run`) and `diff` are distinct verbs
because `pull`'s mental model is "fetches secrets and writes a file." Distinct
verbs are the point — they signal **no values, no writes**.

## Consequences, concerns, and their mitigations

Each concern raised in review is resolved into a concrete decision below. These
are binding for the implementation, not open questions.

### 1. Static-vs-actual semantics must not be over-trusted

Static resolution reports the **declared maximal** set: an alias target counts as
emitted even if its source is absent from the vault at runtime, and a declared
key counts even if the vault lacks it. For v2 default-deny manifests this *is*
the reviewable truth, but the label matters.

**Mitigation (binding):**
- Human output header and every `--json` payload carry `"mode": "static"`
  explicitly. JSON payloads also carry a `"schemaVersion"` integer so snapshots
  and any downstream tooling can evolve safely.
- Docs (README + `keys --help`) state in one sentence: *"`keys` reports the key
  names a manifest **declares** it will emit; it does not contact the vault, so
  it cannot tell you whether a declared key actually exists there."*
- Output is documented as safe to log, paste into a PR, and commit — because it
  contains only names, by construction (see §3).

### 2. `--env` is a no-op for static resolution — do not accept it silently

Because static names are independent of environment, an `--env` flag on `keys`
would falsely imply per-env differences were checked.

**Mitigation (binding):** `keys` and `diff` **do not accept `--env` at all**. It
is not a defined flag; passing it is an "unknown option" parse error from
`parseArgs`, not a silently-ignored value. This is a deliberate divergence from
`pull`/`export-gha`/`run`, and is documented as such. (This also means the
snapshot is keyed by `profile` only — never by env — removing a whole class of
"which env did this snapshot capture?" confusion.)

### 3. The names-only security guarantee is enforced by construction and tested

The entire value proposition is that these commands never touch secret material.
Intent is not enough.

**Mitigation (binding):**
- `keys` and `diff` **never construct or invoke a `SecretsProvider`.** They reach
  only `resolveCompiledFolders` / `emittedKeyNames`, which operate on manifest
  structure alone. There is no code path from these commands to `exportFolder` /
  `exportKeys`.
- A regression test seeds a manifest whose declared key names are *also* used as
  fake values in a stubbed environment, runs `keys` and `diff`, and asserts **no
  value string and no vault call** appears in the output. A second test asserts
  the provider constructor is never reached (e.g. via a throwing provider stub
  injected into the command's dependency seam).
- CI runs of `keys --all --check` are documented as safe on untrusted runners
  precisely because of the above.

### 4. `git show` adds a git runtime dependency for `diff` only — guard it

`diff` is the first subprocess-git use in the repo. It must fail legibly outside
a git repo, on an unknown ref, or on a path absent at a ref.

**Mitigation (binding):**
- `git show` is invoked via `execFile` (argument array, **no shell**), so refs
  and paths cannot be interpreted as shell. Ref and path arguments are validated
  against a conservative allowlist before use, and `--` separates refspec from
  pathspec.
- Distinct, actionable errors for: not a git repository; unknown ref; manifest
  path absent at `<ref>` (reported as "package/manifest did not exist at
  `<ref>`", which for a diff is itself meaningful — the whole set is `added` or
  `removed`).
- The file-path form of `--from`/`--to` needs no git at all, so `diff` between two
  working files works in a non-git checkout.

### 5. `diff --all` cannot fully resolve discovery config at an arbitrary ref

Listing *which packages exist* at a ref requires that ref's discovery config,
which may be `infisicml.config.ts` (needs compilation at that ref). Doing this
faithfully would drag in worktree/checkout machinery — the exact complexity this
design avoids.

**Mitigation (binding):**
- `diff --all` **v1 uses the current working tree's discovery config** to
  enumerate packages, then reads each package's manifest content at `--from` and
  `--to` via `git show`. It diffs the key set of every currently-discovered
  package across the two refs.
- **Documented limitation:** `--all` detects key changes within packages that
  exist today; it does **not** detect packages that were *added or removed*
  between the two refs. When a package's manifest is absent at one ref, that is
  surfaced per §4 (whole set added/removed), so intra-package add/remove is still
  caught — only whole-package add/remove against a since-deleted discovery entry
  is out of scope.
- The per-package form `diff <id> --from … --to …` is **exact** and is the
  recommended tool for verifying a specific package across a migration. `--all`
  is a convenience sweep, and its output header states the limitation.
- A `--json` `"warnings"` array reports any package that could not be resolved at
  a ref, so a sweep never *silently* under-reports.

### 6. Versioning, surface, and docs

**Mitigation (binding):**
- Additive only → **2.2.0**. No existing command, flag, output, or schema
  changes.
- `infisicml.keys.json` snapshot format is versioned (`schemaVersion`, §1) from
  day one so the lockfile can evolve without a flag day.
- README gains a "Key inventory & drift" section; `CHANGELOG.md` gets a 2.2.0
  entry; `keys`/`diff` are added to `USAGE`.
- Note that `keys` supersedes the stderr key-listing side-channel in the `paths`
  command (`src/commands/paths.ts`) for the "what does this emit?" question —
  `paths` keeps emitting its note for its own consumers, but docs point reviewers
  at `keys` as the stdout, machine-readable answer.

## Alternatives considered

- **`pull --dry-run`.** Rejected: overloads a verb whose contract is "fetch and
  write," and invites the assumption that values were involved. A value-free
  operation deserves a value-free verb.
- **Keep the worktree + `comm` script.** Rejected: it is the status quo the issue
  exists to remove, and it writes secret values to disk.
- **Live/vault-resolved mode (former Phase 3).** Rejected outright — see
  "Explicitly rejected" above.
- **Full-fidelity `diff --all` via worktrees.** Rejected for v1: reintroduces the
  checkout cost this design removes, for the narrow case of whole-package
  add/remove against a deleted discovery entry. Revisit only if that case proves
  common.

## Acceptance criteria

- `keys <id>` and `keys <id> --profile P` print the deduped, sorted emitted name
  set; `--json` emits `{ id, profile, mode: "static", schemaVersion, emitted }`.
- `keys --all --json` produces a stable, committable snapshot keyed by
  `(package, profile)` — never by env.
- `keys --all --check` exits non-zero on any drift from the committed snapshot and
  prints the added/removed names; exits zero when in sync.
- `diff <id> --from A --to B` and the two-file form print `added` / `removed` per
  `(package, profile)`; `--all` sweeps current packages with the §5 limitation
  noted in its output.
- Tests prove no value string and no provider call escapes `keys`/`diff` (§3).
- No new runtime dependency beyond `git` (invoked only by `diff`, guarded per §4).
