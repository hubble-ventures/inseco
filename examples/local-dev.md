# Local development orchestration

Locally, inseco assumes **user authentication with the Infisical CLI** — you log
in once as yourself, and inseco shells out to `infisical export` under your
session. There are no machine identities, client secrets, or OIDC tokens on a
developer machine.

## One-time setup

```bash
npm i -D @hubble-ventures/inseco   # or pnpm add -D @hubble-ventures/inseco
infisical login           # authenticate as yourself (opens a browser)
```

Add an `inseco.config.ts` at the repo root (see [`inseco.config.ts`](./inseco.config.ts))
and a `secrets.json` next to each package (see [`secrets.json`](./secrets.json)).

## Everyday flow

```bash
# Pull secrets for every package into gitignored .env.secrets files.
npx inseco pull

# ...or just the package you're working on, refreshing an existing file.
npx inseco pull api --force

# Pull the package in the current directory.
cd apps/api && npx inseco --here pull
```

Each `.env.secrets` is written next to its `secrets.json`. Load it however your
dev runtime already loads env files — for example a package script:

```jsonc
// apps/api/package.json
{
  "scripts": {
    "secrets": "inseco --here pull",
    "dev": "inseco --here pull && node --env-file=.env.secrets server.js"
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
	npx inseco pull
```

## Notes

- `.env.secrets` is **gitignored** — never commit it. Add it to your
  `.gitignore` (inseco writes `# Pulled from Infisical — do not edit` at the top).
- `inseco pull` skips files that already exist unless you pass `--force`.
- The Infisical CLI is only needed locally. CI never uses it — it authenticates
  with GitHub OIDC over the REST API (see [`github-actions.yml`](./github-actions.yml)).
- To run a one-off command with secrets injected as process env instead of a
  file: `npx inseco run api -- <command>` (thin `infisical run` wrapper).
