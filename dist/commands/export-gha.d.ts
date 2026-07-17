import type { CompiledFolder } from "../tree.js";
export type ExportGhaOptions = {
    packageId: string;
    env: string;
    profile?: string;
    cwd?: string;
    githubEnvPath?: string;
    projectSlug?: string;
    identityId?: string;
};
/**
 * Canonical (pre-alias) key names to advertise, split runtime vs all.
 *
 * Classification is by **(path, key)** against the base tree, not by folder path
 * alone: a profile can reuse a base folder path and add deploy-only keys, so a
 * key counts as runtime only if the base tree declares *that key* under *that
 * path*. This keeps a deploy-only credential in a shared folder out of the
 * runtime-scoped advertise set (and thus out of runtime deploy forwarding).
 * Only keys actually in `emitted` are advertised, so an absent optional key is
 * never named.
 */
export declare function computeAdvertiseKeys(allFolders: CompiledFolder[], baseFolders: CompiledFolder[], emitted: Record<string, string>): {
    runtimeKeys: string[];
    allKeys: string[];
};
export declare function runExportGha(options: ExportGhaOptions): Promise<void>;
//# sourceMappingURL=export-gha.d.ts.map