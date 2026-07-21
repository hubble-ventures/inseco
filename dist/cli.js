#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runDiff } from "./commands/diff.js";
import { runExportGha } from "./commands/export-gha.js";
import { runKeys } from "./commands/keys.js";
import { runList } from "./commands/list.js";
import { runPaths } from "./commands/paths.js";
import { runPull } from "./commands/pull.js";
import { runExec } from "./commands/run.js";
import { runValidate } from "./commands/validate.js";
const USAGE = `infisicml — Infisical Secret Orchestration for monorepos

Usage:
  infisicml pull [ids...] [--env ENV] [--profile NAME] [--force] [--here] [--turbo]
  infisicml export-gha <id> [--env ENV] [--profile NAME]
  infisicml list
  infisicml validate
  infisicml paths <id> [--profile NAME] [--comma]
  infisicml run <id> [--profile NAME] [--env ENV] -- <command...>
  infisicml keys <id> [--profile NAME] [--json]        # declared emitted key NAMES (no vault access)
  infisicml keys --all [--json | --check]              # snapshot / lockfile of every key name
  infisicml diff <id> --from <ref|file> --to <ref|file> [--profile NAME] [--json] [--exit-code]
  infisicml diff --all --from <ref> --to <ref> [--json] [--exit-code]

'keys' and 'diff' are value-free: they report key NAMES only and never contact
the vault, so they're safe to log, paste into a PR, and run in untrusted CI.

Config: infisicml.config.{ts,json} at the repo root. See https://github.com/hubble-ventures/infisicml
`;
async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
        console.log(USAGE);
        process.exit(0);
    }
    const subcommand = argv[0];
    const rest = argv.slice(1);
    try {
        switch (subcommand) {
            case "pull":
                await handlePull(rest);
                break;
            case "export-gha":
                await handleExportGha(rest);
                break;
            case "list":
                await runList();
                break;
            case "validate":
                await runValidate();
                break;
            case "paths":
                await handlePaths(rest);
                break;
            case "run":
                await handleRun(rest);
                break;
            case "keys":
                await handleKeys(rest);
                break;
            case "diff":
                await handleDiff(rest);
                break;
            default:
                console.error(`Unknown subcommand: ${subcommand}\n`);
                console.log(USAGE);
                process.exit(1);
        }
    }
    catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
async function handlePull(args) {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            env: { type: "string", default: "development" },
            profile: { type: "string" },
            force: { type: "boolean", short: "f", default: false },
            here: { type: "boolean", default: false },
            turbo: { type: "boolean", default: false },
        },
    });
    await runPull({
        ids: positionals,
        env: values.env ?? "development",
        profile: values.profile,
        force: values.force ?? false,
        here: values.here ?? false,
        turbo: values.turbo ?? false,
    });
}
async function handleExportGha(args) {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            env: { type: "string", default: "production" },
            profile: { type: "string" },
        },
    });
    const packageId = positionals[0];
    if (!packageId) {
        throw new Error("export-gha requires a package id");
    }
    await runExportGha({
        packageId,
        env: values.env ?? "production",
        profile: values.profile,
    });
}
async function handlePaths(args) {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            profile: { type: "string" },
            comma: { type: "boolean", default: false },
        },
    });
    const packageId = positionals[0];
    if (!packageId) {
        throw new Error("paths requires a package id");
    }
    await runPaths({
        packageId,
        profile: values.profile,
        comma: values.comma ?? false,
    });
}
async function handleRun(args) {
    const sep = args.indexOf("--");
    if (sep === -1) {
        throw new Error("run requires -- before command");
    }
    const before = args.slice(0, sep);
    const command = args.slice(sep + 1);
    if (command.length === 0) {
        throw new Error("run requires a command after --");
    }
    const { values, positionals } = parseArgs({
        args: before,
        allowPositionals: true,
        options: {
            env: { type: "string", default: "development" },
            profile: { type: "string" },
        },
    });
    const packageId = positionals[0];
    if (!packageId) {
        throw new Error("run requires a package id");
    }
    const code = await runExec({
        packageId,
        profile: values.profile,
        env: values.env ?? "development",
        command,
    });
    process.exit(code);
}
// `keys`/`diff` intentionally omit `--env`: static key NAMES never depend on the
// environment (ADR 0001 §2), so parseArgs rejects `--env` as unknown rather than
// silently accepting it and implying a per-env check that didn't happen.
async function handleKeys(args) {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            profile: { type: "string" },
            all: { type: "boolean", default: false },
            json: { type: "boolean", default: false },
            check: { type: "boolean", default: false },
        },
    });
    await runKeys({
        packageId: positionals[0],
        profile: values.profile,
        all: values.all ?? false,
        json: values.json ?? false,
        check: values.check ?? false,
    });
}
async function handleDiff(args) {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            from: { type: "string" },
            to: { type: "string" },
            profile: { type: "string" },
            all: { type: "boolean", default: false },
            json: { type: "boolean", default: false },
            "exit-code": { type: "boolean", default: false },
        },
    });
    if (!values.from || !values.to) {
        throw new Error("diff requires --from and --to");
    }
    const code = await runDiff({
        packageId: positionals[0],
        from: values.from,
        to: values.to,
        profile: values.profile,
        all: values.all ?? false,
        json: values.json ?? false,
        exitCode: values["exit-code"] ?? false,
    });
    process.exit(code);
}
main();
//# sourceMappingURL=cli.js.map