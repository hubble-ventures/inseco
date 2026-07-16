import { loadConfig } from "../config.js";
import { normalizeFolderPath } from "../manifest.js";
import { discoverManifests } from "../registry.js";
export async function runList(cwd) {
    const config = await loadConfig(cwd);
    const manifests = discoverManifests(config);
    for (const { id, config: m } of manifests) {
        const paths = m.paths.map((p) => normalizeFolderPath(p)).join(", ");
        console.log(`  ${id}: ${paths}`);
        if (m.profiles) {
            for (const [name, profile] of Object.entries(m.profiles)) {
                const profilePaths = profile.paths
                    .map((p) => normalizeFolderPath(p))
                    .join(", ");
                console.log(`    [${name}]: ${profilePaths}`);
            }
        }
    }
}
//# sourceMappingURL=list.js.map