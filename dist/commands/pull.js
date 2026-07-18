import { resolve } from "node:path";
import { loadConfig } from "../config.js";
import { shouldSkipInfisicalPull } from "../ci-skip.js";
import { commandExists, LocalProvider } from "../providers/local.js";
import { pullManifest } from "../pull.js";
import { discoverPackages, loadPackage } from "../registry.js";
export async function runPull(options) {
    const config = await loadConfig(options.cwd);
    const repoRoot = config.repoRoot;
    const envName = process.env.INFISICAL_ENV ?? options.env;
    if (!config.projectId) {
        throw new Error("INFISICAL_PROJECT_ID not resolved — set config.projectId, projectIdEnvFile, or the INFISICAL_PROJECT_ID env var");
    }
    // Select target packages first, then load only those — so an unrelated
    // package with an ambiguous or invalid manifest never blocks a scoped pull.
    let targets = discoverPackages(config);
    if (options.here) {
        const cwd = process.cwd();
        const match = targets.find((p) => resolve(p.dir) === resolve(cwd));
        if (!match) {
            throw new Error(`No secrets manifest in ${cwd}`);
        }
        targets = [match];
    }
    else if (options.ids.length > 0) {
        const allowed = new Set(options.ids);
        targets = targets.filter((p) => allowed.has(p.id));
        const missing = options.ids.filter((id) => !targets.some((p) => p.id === id));
        if (missing.length > 0) {
            throw new Error(`Unknown package id(s): ${missing.join(", ")}`);
        }
    }
    if (targets.length === 0) {
        console.log("No secrets manifests found.");
        return;
    }
    const manifests = targets.map(loadPackage);
    // The infisical CLI is only needed for manifests that will actually pull.
    // Mirror pullManifest's own skip decision exactly so CI stubs never demand a
    // tool they don't use.
    const needsInfisical = manifests.some((m) => !shouldSkipInfisicalPull(m.config, options.force));
    if (needsInfisical && !commandExists("infisical")) {
        throw new Error("infisical CLI not found — install and run: infisical login");
    }
    const provider = new LocalProvider({
        projectId: config.projectId,
        cwd: repoRoot,
    });
    let pulled = 0;
    let skipped = 0;
    for (const manifest of manifests) {
        const result = await pullManifest({
            manifest,
            repoRoot,
            envName,
            profile: options.profile,
            force: options.force,
            turboMode: options.turbo,
            provider,
        });
        if (result === "pulled")
            pulled += 1;
        else
            skipped += 1;
    }
    console.log(`\nDone: ${pulled} pulled, ${skipped} skipped (${manifests.length} package(s)).`);
}
//# sourceMappingURL=pull.js.map