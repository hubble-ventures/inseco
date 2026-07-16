import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { applyAliases } from "./aliases.js";
import { fetchSecretsForPaths, keysForCiStub, shouldSkipInfisicalPull, } from "./ci-skip.js";
import { serializeDotenv } from "./dotenv.js";
import { selectEmittedSecrets } from "./include.js";
import { normalizeFolderPath, resolveInclude, resolvePaths, resolveSecretsOutputPath, } from "./manifest.js";
import { resolveOptionalKeys } from "./optional-keys.js";
export function writeInjectedSecretsStub(outputPath, manifest, keys) {
    const fromEnv = {};
    for (const key of keys) {
        const value = process.env[key];
        if (value)
            fromEnv[key] = value;
    }
    const header = [
        "# Skipped Infisical pull — required build env vars already injected.",
        `# Package: ${manifest.id}`,
        "# Source: process.env (CI / workflow build-env-vars)",
        `# Generated: ${new Date().toISOString()}`,
        "",
    ].join("\n");
    writeFileSync(outputPath, header + serializeDotenv(fromEnv));
}
export async function pullManifest(options) {
    const { manifest, repoRoot, envName, profile, force = false, turboMode = false, provider, } = options;
    const outputName = manifest.config.output ?? ".env.secrets";
    const outputPath = resolveSecretsOutputPath(manifest.dir, outputName);
    const rel = relative(repoRoot, outputPath);
    if (!turboMode && existsSync(outputPath) && !force) {
        console.log(`⏭️  ${manifest.id}: ${rel} exists (use --force to refresh)`);
        return "skipped";
    }
    if (shouldSkipInfisicalPull(manifest.config, force)) {
        const keys = keysForCiStub(manifest.config);
        writeInjectedSecretsStub(outputPath, manifest, keys);
        console.log(`⏭️  ${manifest.id}: skipped Infisical pull (injected env → ${rel})`);
        return "skipped";
    }
    const paths = resolvePaths(manifest.config, profile);
    const aliased = applyAliases(await fetchSecretsForPaths(provider, envName, paths), manifest.config);
    // Default-deny key selection: emit only the allowlisted keys when `include`
    // is set (after aliases). Absent = emit all.
    const include = resolveInclude(manifest.config, profile);
    const merged = selectEmittedSecrets(aliased, include, resolveOptionalKeys(manifest.config, envName));
    // filter(Boolean) drops the optional Profile/Include lines when absent. It
    // would also drop a trailing "" sentinel, so append the trailing newline
    // explicitly — otherwise the first secret gets glued onto the "# Generated"
    // line.
    const header = `${[
        "# Pulled from Infisical — do not edit. Refresh: inseco pull",
        `# Package: ${manifest.id}`,
        `# Environment: ${envName}`,
        profile ? `# Profile: ${profile}` : "",
        `# Paths: ${paths.map((p) => normalizeFolderPath(p)).join(", ")}`,
        include ? `# Include: ${include.join(", ")}` : "",
        `# Generated: ${new Date().toISOString()}`,
    ]
        .filter(Boolean)
        .join("\n")}\n`;
    writeFileSync(outputPath, header + serializeDotenv(merged));
    console.log(`✅ ${manifest.id}: wrote ${rel} (${Object.keys(merged).length} vars)`);
    return "pulled";
}
//# sourceMappingURL=pull.js.map