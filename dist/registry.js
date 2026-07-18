import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadManifestFromDir, } from "./manifest.js";
/**
 * Discover every secrets manifest in the repo (YAML preferred, JSON supported),
 * driven entirely by `config.discovery` — no repo-specific directory constants.
 * Explicit `packages` win over `roots`-discovered entries at the same directory.
 */
export function discoverManifests(config) {
    const { repoRoot } = config;
    const byDir = new Map();
    const scanDir = (dir, id) => {
        const loaded = loadManifestFromDir(dir);
        if (!loaded)
            return;
        byDir.set(resolve(dir), { dir, id, config: loaded.manifest, file: loaded.file });
    };
    for (const root of config.discovery.roots ?? []) {
        const rootAbs = join(repoRoot, root);
        if (!existsSync(rootAbs))
            continue;
        for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            scanDir(join(rootAbs, entry.name), entry.name);
        }
    }
    // Explicit packages last so a custom id/dir overrides a roots-discovered one.
    for (const { id, dir } of config.discovery.packages ?? []) {
        scanDir(join(repoRoot, dir), id);
    }
    return [...byDir.values()].sort((a, b) => a.id.localeCompare(b.id));
}
//# sourceMappingURL=registry.js.map