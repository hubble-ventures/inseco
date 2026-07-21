import { type SecretsManifest } from "./manifest.js";
/** Is `cwd` inside a git work tree? `diff`'s ref mode needs one; the file mode doesn't. */
export declare function isGitRepo(cwd: string): boolean;
/** Does `ref` resolve to a commit? Lets us distinguish an unknown ref from an absent path. */
export declare function refExists(cwd: string, ref: string): boolean;
/** Absolute path of the git work-tree root containing `cwd`. Throws outside a repo. */
export declare function gitRoot(cwd: string): string;
/**
 * Read a git-root-relative file's contents at `ref` via `git show <ref>:<path>`.
 * git resolves the colon path against the repository root, so `repoRelPath` must
 * be relative to the work-tree root (see {@link gitRoot}). Returns `null` when
 * the path does not exist at that ref (a meaningful outcome for a diff — the
 * whole set is then added or removed). Throws only on a bad ref or malformed
 * path, so callers can report those distinctly.
 */
export declare function showFileAtRef(cwd: string, ref: string, repoRelPath: string): string | null;
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
export declare function loadManifestAtRef(cwd: string, packageDir: string, ref: string): SecretsManifest | null;
//# sourceMappingURL=git.d.ts.map