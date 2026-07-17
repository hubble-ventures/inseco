import { loadConfig } from "../config.js";
import { normalizeFolderPath, resolveFetchMode, resolveInclude, resolvePaths, } from "../manifest.js";
import { discoverManifests } from "../registry.js";
export async function runPaths(options) {
    const config = await loadConfig(options.cwd);
    const manifests = discoverManifests(config);
    const manifest = manifests.find((m) => m.id === options.packageId);
    if (!manifest) {
        throw new Error(`Unknown package id: ${options.packageId}`);
    }
    const paths = resolvePaths(manifest.config, options.profile);
    const normalized = paths.map((p) => normalizeFolderPath(p));
    // `paths` feeds the infisical CLI, which fetches whole folders — key-level
    // `include` filtering happens later, in pull/export-gha. Warn on stderr so the
    // filtering isn't invisible to someone reading only this folder list.
    const include = resolveInclude(manifest.config, options.profile);
    if (include) {
        console.error(`# note: ${options.packageId} filters emitted keys to: ${include.join(", ")}`);
    }
    if (resolveFetchMode(manifest.config, options.profile) === "keys") {
        console.error(`# note: ${options.packageId} uses fetch: "keys" — only the include keys are emitted; in CI they are read per-key from the vault (wire-level least privilege).`);
    }
    if (options.comma) {
        console.log(normalized.map((p) => p.replace(/^\//, "")).join(","));
    }
    else {
        console.log(normalized.map((p) => `--path=${p}`).join(" "));
    }
}
//# sourceMappingURL=paths.js.map