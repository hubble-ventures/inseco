import { loadConfig } from "../config.js";
import { normalizeFolderPath, resolveCompiledFolders, resolveFetchMode, } from "../manifest.js";
import { discoverPackages, loadPackage } from "../registry.js";
export async function runPaths(options) {
    const config = await loadConfig(options.cwd);
    const ref = discoverPackages(config).find((p) => p.id === options.packageId);
    if (!ref) {
        throw new Error(`Unknown package id: ${options.packageId}`);
    }
    const manifest = loadPackage(ref);
    const folders = resolveCompiledFolders(manifest.config, options.profile);
    const normalized = folders.map((f) => normalizeFolderPath(f.path));
    // `paths` feeds the infisical CLI, which fetches whole folders — the tree's
    // per-folder key selection happens later, in pull/export-gha. Note on stderr
    // which keys each folder emits so the selection isn't invisible to someone
    // reading only this folder list.
    for (const folder of folders) {
        const keys = folder.keys.map((k) => k.key).join(", ");
        console.error(`# note: ${normalizeFolderPath(folder.path)} emits: ${keys}`);
    }
    if (resolveFetchMode(manifest.config, options.profile) === "keys") {
        console.error(`# note: ${options.packageId} uses fetch: "keys" — only the declared keys are read, per-key from the vault (wire-level least privilege).`);
    }
    if (options.comma) {
        console.log(normalized.map((p) => p.replace(/^\//, "")).join(","));
    }
    else {
        console.log(normalized.map((p) => `--path=${p}`).join(" "));
    }
}
//# sourceMappingURL=paths.js.map