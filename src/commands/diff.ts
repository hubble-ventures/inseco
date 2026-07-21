import { existsSync, readFileSync, statSync } from "node:fs";
import { loadConfig } from "../config.js";
import { isGitRepo, loadManifestAtRef, refExists } from "../git.js";
import {
  DEFAULT_PROFILE_LABEL,
  diffKeyNames,
  emittedNamesFor,
  hasKeyChange,
} from "../keys.js";
import {
  loadManifestJson,
  manifestFormatForFilename,
  parseManifestContent,
  type SecretsManifest,
} from "../manifest.js";
import { basename } from "node:path";
import { discoverPackages, loadPackage, type PackageRef } from "../registry.js";

export type DiffOptions = {
  /** A single package id; omitted with `--all`. */
  packageId?: string;
  /** A git ref or (per-package only) a manifest file path. */
  from: string;
  to: string;
  profile?: string;
  all: boolean;
  json: boolean;
  /** Exit non-zero when any key changed (like `git diff --exit-code`). */
  exitCode: boolean;
  cwd?: string;
};

/** Per-(package, profile) result. `null` sides mean the manifest was absent there. */
type ProfileDiff = {
  package: string;
  profile: string;
  fromPresent: boolean;
  toPresent: boolean;
  added: string[];
  removed: string[];
};

type DiffReport = {
  results: ProfileDiff[];
  warnings: string[];
};

export async function runDiff(options: DiffOptions): Promise<number> {
  const config = await loadConfig(options.cwd);
  const cwd = options.cwd ?? config.repoRoot;

  const report: DiffReport = { results: [], warnings: [] };
  const refsInUse = [options.from, options.to].filter(
    (spec) => !isFilePath(spec)
  );
  if (refsInUse.length > 0) assertGitRefs(cwd, refsInUse);

  if (options.all) {
    if (isFilePath(options.from) || isFilePath(options.to)) {
      throw new Error("diff --all compares two git refs, not file paths");
    }
    for (const ref of discoverPackages(config)) {
      diffPackage(cwd, ref, options, report);
    }
  } else {
    if (!options.packageId) {
      throw new Error("diff requires a package id (or --all)");
    }
    const ref = discoverPackages(config).find(
      (p) => p.id === options.packageId
    );
    if (!ref) throw new Error(`Unknown package id: ${options.packageId}`);
    diffPackage(cwd, ref, options, report);
  }

  emitReport(report, options);
  const changed = report.results.some((r) => hasKeyChange(r));
  return options.exitCode && changed ? 1 : 0;
}

function diffPackage(
  cwd: string,
  ref: PackageRef,
  options: DiffOptions,
  report: DiffReport
): void {
  let from: SecretsManifest | null;
  let to: SecretsManifest | null;
  try {
    from = resolveSide(cwd, ref, options.from);
    to = resolveSide(cwd, ref, options.to);
  } catch (err) {
    // A parse/validation error at one ref must not abort the whole sweep; record
    // it so the report never silently under-counts (ADR 0001 §5).
    report.warnings.push(
      `${ref.id}: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const profiles = options.profile
    ? [options.profile]
    : profileUnion(from, to);

  for (const label of profiles) {
    const profile = label === DEFAULT_PROFILE_LABEL ? undefined : label;
    const diff = diffKeyNames(
      emittedNamesFor(from, profile),
      emittedNamesFor(to, profile)
    );
    report.results.push({
      package: ref.id,
      profile: label,
      fromPresent: profilePresent(from, profile),
      toPresent: profilePresent(to, profile),
      added: diff.added,
      removed: diff.removed,
    });
  }
}

/** Resolve one side of the diff: a manifest file on disk, or a manifest at a git ref. */
function resolveSide(
  cwd: string,
  ref: PackageRef,
  spec: string
): SecretsManifest | null {
  if (isFilePath(spec)) return loadManifestFromPath(spec);
  return loadManifestAtRef(cwd, ref.dir, spec);
}

function loadManifestFromPath(path: string): SecretsManifest {
  const format = manifestFormatForFilename(basename(path));
  if (!format) {
    throw new Error(
      `Not a recognized manifest file: ${path} (expected .yaml/.yml/.json)`
    );
  }
  return loadManifestJson(parseManifestContent(readFileSync(path, "utf8"), format));
}

/** A spec is a file path if it exists on disk as a file; otherwise it's a git ref. */
function isFilePath(spec: string): boolean {
  return existsSync(spec) && statSync(spec).isFile();
}

function assertGitRefs(cwd: string, refs: string[]): void {
  if (!isGitRepo(cwd)) {
    throw new Error(
      `Not a git repository: ${cwd}. Pass manifest file paths to --from/--to instead of refs.`
    );
  }
  for (const ref of refs) {
    if (!refExists(cwd, ref)) throw new Error(`Unknown git ref: ${ref}`);
  }
}

function profileUnion(
  from: SecretsManifest | null,
  to: SecretsManifest | null
): string[] {
  const names = new Set<string>([DEFAULT_PROFILE_LABEL]);
  for (const m of [from, to]) {
    for (const name of Object.keys(m?.profiles ?? {})) names.add(name);
  }
  return [
    DEFAULT_PROFILE_LABEL,
    ...[...names].filter((n) => n !== DEFAULT_PROFILE_LABEL).sort(),
  ];
}

function profilePresent(
  manifest: SecretsManifest | null,
  profile?: string
): boolean {
  if (!manifest) return false;
  if (profile === undefined) return true;
  return manifest.profiles?.[profile] !== undefined;
}

function emitReport(report: DiffReport, options: DiffOptions): void {
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "static",
          from: options.from,
          to: options.to,
          results: report.results,
          warnings: report.warnings,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  for (const w of report.warnings) console.error(`⚠️  ${w}`);
  if (options.all) {
    // The current-tree discovery scopes --all; a package added or removed
    // between the two refs against a since-deleted discovery entry is out of
    // scope (ADR 0001 §5). Intra-package add/remove is still caught.
    console.error(
      "# diff --all is scoped to packages discovered in the working tree"
    );
  }

  let printed = false;
  for (const r of report.results) {
    if (!hasKeyChange(r)) continue;
    printed = true;
    const note = presenceNote(r);
    console.log(`${r.package} [${r.profile}]${note}`);
    for (const k of r.added) console.log(`  + ${k}`);
    for (const k of r.removed) console.log(`  - ${k}`);
  }
  if (!printed) console.log("No emitted-key changes.");
}

function presenceNote(r: ProfileDiff): string {
  if (!r.fromPresent) return "  (added — absent in --from)";
  if (!r.toPresent) return "  (removed — absent in --to)";
  return "";
}

export type { ProfileDiff, DiffReport };
