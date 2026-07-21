import { existsSync, readFileSync, statSync } from "node:fs";
import { loadConfig } from "../config.js";
import { isGitRepo, loadManifestAtRef, refExists } from "../git.js";
import { DEFAULT_PROFILE_LABEL, diffKeyNames, emittedNamesFor, hasKeyChange, } from "../keys.js";
import { loadManifestJson, manifestFormatForFilename, parseManifestContent, } from "../manifest.js";
import { basename } from "node:path";
import { discoverPackages } from "../registry.js";
export async function runDiff(options) {
    const config = await loadConfig(options.cwd);
    const cwd = options.cwd ?? config.repoRoot;
    const report = { results: [], warnings: [] };
    const refsInUse = [options.from, options.to].filter((spec) => !isFilePath(spec));
    if (refsInUse.length > 0)
        assertGitRefs(cwd, refsInUse);
    if (options.all) {
        if (isFilePath(options.from) || isFilePath(options.to)) {
            throw new Error("diff --all compares two git refs, not file paths");
        }
        for (const ref of discoverPackages(config)) {
            diffPackage(cwd, ref, options, report);
        }
    }
    else {
        if (!options.packageId) {
            throw new Error("diff requires a package id (or --all)");
        }
        const ref = discoverPackages(config).find((p) => p.id === options.packageId);
        if (!ref)
            throw new Error(`Unknown package id: ${options.packageId}`);
        diffPackage(cwd, ref, options, report);
    }
    emitReport(report, options);
    const changed = report.results.some((r) => hasKeyChange(r));
    return options.exitCode && changed ? 1 : 0;
}
function diffPackage(cwd, ref, options, report) {
    let from;
    let to;
    try {
        from = resolveSide(cwd, ref, options.from);
        to = resolveSide(cwd, ref, options.to);
    }
    catch (err) {
        // A parse/validation error at one ref must not abort the whole sweep; record
        // it so the report never silently under-counts (ADR 0001 §5).
        report.warnings.push(`${ref.id}: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }
    const profiles = options.profile
        ? [options.profile]
        : profileUnion(from, to);
    for (const label of profiles) {
        const profile = label === DEFAULT_PROFILE_LABEL ? undefined : label;
        const diff = diffKeyNames(emittedNamesFor(from, profile), emittedNamesFor(to, profile));
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
function resolveSide(cwd, ref, spec) {
    if (isFilePath(spec))
        return loadManifestFromPath(spec);
    return loadManifestAtRef(cwd, ref.dir, spec);
}
function loadManifestFromPath(path) {
    const format = manifestFormatForFilename(basename(path));
    if (!format) {
        throw new Error(`Not a recognized manifest file: ${path} (expected .yaml/.yml/.json)`);
    }
    return loadManifestJson(parseManifestContent(readFileSync(path, "utf8"), format));
}
/** A spec is a file path if it exists on disk as a file; otherwise it's a git ref. */
function isFilePath(spec) {
    return existsSync(spec) && statSync(spec).isFile();
}
function assertGitRefs(cwd, refs) {
    if (!isGitRepo(cwd)) {
        throw new Error(`Not a git repository: ${cwd}. Pass manifest file paths to --from/--to instead of refs.`);
    }
    for (const ref of refs) {
        if (!refExists(cwd, ref))
            throw new Error(`Unknown git ref: ${ref}`);
    }
}
function profileUnion(from, to) {
    const names = new Set([DEFAULT_PROFILE_LABEL]);
    for (const m of [from, to]) {
        for (const name of Object.keys(m?.profiles ?? {}))
            names.add(name);
    }
    return [
        DEFAULT_PROFILE_LABEL,
        ...[...names].filter((n) => n !== DEFAULT_PROFILE_LABEL).sort(),
    ];
}
function profilePresent(manifest, profile) {
    if (!manifest)
        return false;
    if (profile === undefined)
        return true;
    return manifest.profiles?.[profile] !== undefined;
}
function emitReport(report, options) {
    if (options.json) {
        process.stdout.write(`${JSON.stringify({
            mode: "static",
            from: options.from,
            to: options.to,
            results: report.results,
            warnings: report.warnings,
        }, null, 2)}\n`);
        return;
    }
    for (const w of report.warnings)
        console.error(`⚠️  ${w}`);
    if (options.all) {
        // The current-tree discovery scopes --all; a package added or removed
        // between the two refs against a since-deleted discovery entry is out of
        // scope (ADR 0001 §5). Intra-package add/remove is still caught.
        console.error("# diff --all is scoped to packages discovered in the working tree");
    }
    let printed = false;
    for (const r of report.results) {
        if (!hasKeyChange(r))
            continue;
        printed = true;
        const note = presenceNote(r);
        console.log(`${r.package} [${r.profile}]${note}`);
        for (const k of r.added)
            console.log(`  + ${k}`);
        for (const k of r.removed)
            console.log(`  - ${k}`);
    }
    if (!printed)
        console.log("No emitted-key changes.");
}
function presenceNote(r) {
    if (!r.fromPresent)
        return "  (added — absent in --from)";
    if (!r.toPresent)
        return "  (removed — absent in --to)";
    return "";
}
//# sourceMappingURL=diff.js.map