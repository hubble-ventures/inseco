# Local development orchestration

Locally, infisicml assumes **user authentication with the Infisical CLI** — you log
in once as yourself, and infisicml shells out to `infisical export` under your
session. There are no machine identities, client secrets, or OIDC tokens on a
developer machine.

## One-time setup

```bash
npm i -D @hubble-ventures/infisicml   # or pnpm add -D @hubble-ventures/infisicml
infisical login           # authenticate as yourself (opens a browser)
```

Add an `infisicml.config.ts` at the repo root (see [`infisicml.config.ts`](./infisicml.config.ts))
and a `secrets.json` next to each package (see [`secrets.json`](./secrets.json)).

## Everyday flow

```bash
# Pull secrets for every package into gitignored .env.secrets files.
npx infisicml pull

# ...or just the package you're working on, refreshing an existing file.
npx infisicml pull api --force

# Pull the package in the current directory.
cd apps/api && npx infisicml --here pull
```

Each `.env.secrets` is written next to its `secrets.json`. Load it however your
dev runtime already loads env files — for example a package script:

```jsonc
// apps/api/package.json
{
  "scripts": {
    "secrets": "infisicml --here pull",
    "dev": "infisicml --here pull && node --env-file=.env.secrets server.js"
  }
}
```

Or wire it into your task runner so `.env.secrets` is always fresh before the
app boots:

```makefile
# Makefile
dev: secrets
	pnpm --filter api dev

secrets:
	npx infisicml pull
```

## Notes

- `.env.secrets` is **gitignored** — never commit it. Add it to your
  `.gitignore` (infisicml writes `# Pulled from Infisical — do not edit` at the top).
- `infisicml pull` skips files that already exist unless you pass `--force`.
- The Infisical CLI is only needed locally. CI never uses it — it authenticates
  with GitHub OIDC over the REST API (see [`github-actions.yml`](./github-actions.yml)).
- To run a one-off command with secrets injected as process env instead of a
  file: `npx infisicml run api -- <command>` (thin `infisical run` wrapper).
