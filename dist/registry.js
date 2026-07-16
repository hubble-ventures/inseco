import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadManifestJson } from "./manifest.js";
/**
 * Discover every `secrets.json` in the repo, driven entirely by
 * `config.discovery` — no repo-specific directory constants. Explicit
 * `packages` win over `roots`-discovered entries at the same directory.
 */
export function discoverManifests(config) {
    const { repoRoot } = config;
    const byDir = new Map();
    const scanDir = (dir, id) => {
        const manifestPath = join(dir, "secrets.json");
        if (!existsSync(manifestPath))
            return;
        const parsed = loadManifestJson(JSON.parse(readFileSync(manifestPath, "utf8")));
        byDir.set(resolve(dir), { dir, id, config: parsed });
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