import { loadConfig } from "../config.js";
import { secretsManifestSchema } from "../manifest.js";
import { discoverManifests } from "../registry.js";
export async function runValidate(cwd) {
    const config = await loadConfig(cwd);
    const manifests = discoverManifests(config);
    let errors = 0;
    for (const { id, dir, config: m } of manifests) {
        const result = secretsManifestSchema.safeParse(m);
        if (!result.success) {
            console.error(`❌ ${id} (${dir}/secrets.json):`);
            for (const issue of result.error.issues) {
                console.error(`   ${issue.path.join(".")}: ${issue.message}`);
            }
            errors += 1;
        }
    }
    if (errors > 0) {
        throw new Error(`validate failed: ${errors} invalid manifest(s)`);
    }
    console.log(`✅ ${manifests.length} manifest(s) valid`);
}
//# sourceMappingURL=validate.js.map