#!/usr/bin/env bash
#
# Local smoke test: drives the BUILT CLI (dist/cli.js) end-to-end against the
# committed fixture repo, exercising every command that does not require a live
# Infisical session:
#
#   validate  — schema-checks every secrets.json
#   list      — prints manifests + profile paths
#   paths     — resolves a package's vault paths
#   pull      — writes a real .env.secrets via the CI-stub path (no Infisical)
#
# The live-Infisical path (OIDC -> GITHUB_ENV through the composite action) is
# proven separately by .github/workflows/e2e.yml (workflow_dispatch), which needs
# a sandbox Infisical project.
#
# Run:  npm run build && bash scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FIXTURE="$ROOT/tests/fixtures/repo"

if [ ! -f "$CLI" ]; then
  echo "dist/cli.js missing — run 'npm run build' first." >&2
  exit 1
fi

run() { echo "== infisicml $* =="; ( cd "$FIXTURE" && node "$CLI" "$@" ); echo; }

run validate
run list
run paths api --comma

echo "== infisicml pull api (CI stub, no Infisical) =="
STUB="$FIXTURE/apps/api/.env.secrets"
rm -f "$STUB"
( cd "$FIXTURE" && CI=true INFISICAL_PROJECT_ID=smoke node "$CLI" pull api )
if [ ! -f "$STUB" ]; then
  echo "FAIL: expected $STUB to be written" >&2
  exit 1
fi
# Print ONLY the comment header, never KEY=VALUE lines — this file could hold
# real values if the smoke were ever pointed at a live Infisical session, and CI
# logs are world-readable on public repos.
echo "  wrote apps/api/.env.secrets (header; values redacted):"
grep '^#' "$STUB" | sed 's/^/    /'
echo "    ($(grep -cvE '^#|^$' "$STUB") secret var(s) written)"
rm -f "$STUB"

echo
echo "SMOKE OK"
