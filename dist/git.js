import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadManifestJson, MANIFEST_FILENAMES, manifestFormatForFilename, parseManifestContent, } from "./manifest.js";
// A conservative allowlist for git refspecs. Refs and paths are passed to git as
// a separate argument array (never a shell string) via execFile, so a shell
// can't interpret them — but we still reject anything outside the characters a
// real branch/tag/sha/relative-ref uses. The first character may not be `-`, so
// a `ref:path` token can never be misread as an option even though we can't use
// `--` with git's colon syntax. Paths are held to a similar safe, dash-first-free set.
const REF_PATTERN = /^[A-Za-z0-9._/@][A-Za-z0-9._/@^~{}-]*$/;
const PATH_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
function git(cwd, args) {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}
/** Is `cwd` inside a git work tree? `diff`'s ref mode needs one; the file mode doesn't. */
export function isGitRepo(cwd) {
    try {
        git(cwd, ["rev-parse", "--is-inside-work-tree"]);
        return true;
    }
    catch {
        return false;
    }
}
/** Does `ref` resolve to a commit? Lets us distinguish an unknown ref from an absent path. */
export function refExists(cwd, ref) {
    if (!REF_PATTERN.test(ref))
        return false;
    try {
        git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
        return true;
    }
    catch {
        return false;
    }
}
/** Absolute path of the git work-tree root containing `cwd`. Throws outside a repo. */
export function gitRoot(cwd) {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}
/**
 * Read a git-root-relative file's contents at `ref` via `git show <ref>:<path>`.
 * git resolves the colon path against the repository root, so `repoRelPath` must
 * be relative to the work-tree root (see {@link gitRoot}). Returns `null` when
 * the path does not exist at that ref (a meaningful outcome for a diff — the
 * whole set is then added or removed). Throws only on a bad ref or malformed
 * path, so callers can report those distinctly.
 */
export function showFileAtRef(cwd, ref, repoRelPath) {
    if (!REF_PATTERN.test(ref))
        throw new Error(`Invalid git ref: ${ref}`);
    if (!PATH_PATTERN.test(repoRelPath) || repoRelPath.includes("..")) {
        throw new Error(`Invalid manifest path: ${repoRelPath}`);
    }
    try {
        // git's `<ref>:<path>` colon form takes no `--` (that's for the separate-arg
        // `<ref> -- <path>` form); REF_PATTERN/PATH_PATTERN forbid a leading `-`, so
        // the combined token can't be read as an option.
        return git(cwd, ["show", `${ref}:${repoRelPath}`]);
    }
    catch {
        return null; // absent at this ref
    }
}
/**
 * Load and validate the manifest for a package directory as it existed at `ref`,
 * trying each manifest filename in preference order ({@link MANIFEST_FILENAMES}).
 * Returns `null` when the package had no manifest at that ref. Throws on an
 * ambiguous directory (more than one manifest file at that ref) or an invalid
 * manifest, mirroring the on-disk loader so a diff can't silently pick a winner.
 *
 * `packageDir` is resolved relative to the git work-tree root (not the config
 * root), so a config living in a subdirectory of the repo still reads the right
 * path. `ref` must already exist (see {@link refExists}); this reads content
 * only and never touches the working tree or writes to disk.
 */
export function loadManifestAtRef(cwd, packageDir, ref) {
    // gitRoot returns a canonical (symlink-resolved) path; resolve packageDir the
    // same way so `relative()` doesn't emit a spurious `../…` on platforms where
    // the temp/working dir is itself a symlink (e.g. macOS /var -> /private/var).
    const root = gitRoot(cwd);
    const pkg = existsSync(packageDir) ? realpathSync(packageDir) : resolve(packageDir);
    const repoRelDir = relative(root, pkg);
    const found = [];
    for (const filename of MANIFEST_FILENAMES) {
        const repoRelPath = repoRelDir ? `${repoRelDir}/${filename}` : filename;
        const raw = showFileAtRef(cwd, ref, repoRelPath);
        if (raw !== null)
            found.push({ filename, raw });
    }
    if (found.length === 0)
        return null;
    if (found.length > 1) {
        throw new Error(`Ambiguous secrets manifest for '${repoRelDir}' at ${ref}: found ` +
            `${found.map((f) => f.filename).join(", ")}. Keep exactly one.`);
    }
    const [{ filename, raw }] = found;
    const format = manifestFormatForFilename(filename);
    if (!format)
        return null;
    return loadManifestJson(parseManifestContent(raw, format));
}
//# sourceMappingURL=git.js.map