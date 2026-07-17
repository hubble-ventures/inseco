import { loadConfig } from "../config.js";
import { normalizeFolderPath } from "../manifest.js";
import { discoverManifests } from "../registry.js";
export async function runList(cwd) {
    const config = await loadConfig(cwd);
    const manifests = discoverManifests(config);
    for (const { id, config: m } of manifests) {
        const paths = m.paths.map((p) => normalizeFolderPath(p)).join(", ");
        console.log(`  ${id}: ${paths}`);
        if (m.include) {
            console.log(`    include: ${m.include.join(", ")}`);
        }
        if (m.fetch) {
            console.log(`    fetch: ${m.fetch}`);
        }
        if (m.profiles) {
            for (const [name, profile] of Object.entries(m.profiles)) {
                const profilePaths = profile.paths
                    .map((p) => normalizeFolderPath(p))
                    .join(", ");
                console.log(`    [${name}]: ${profilePaths}`);
                // A profile include/fetch replaces the root value; show whichever applies.
                const effectiveInclude = profile.include ?? m.include;
                if (effectiveInclude) {
                    console.log(`      include: ${effectiveInclude.join(", ")}`);
                }
                const effectiveFetch = profile.fetch ?? m.fetch;
                if (effectiveFetch) {
                    console.log(`      fetch: ${effectiveFetch}`);
                }
            }
        }
    }
}
//# sourceMappingURL=list.js.map