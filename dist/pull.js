import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { applyAliases } from "./aliases.js";
import { fetchCompiledSecrets, keysForCiStub, shouldSkipInfisicalPull, } from "./ci-skip.js";
import { serializeDotenv } from "./dotenv.js";
import { selectEmittedSecrets } from "./include.js";
import { normalizeFolderPath, resolveCompiledFolders, resolveFetchMode, resolveSecretsOutputPath, } from "./manifest.js";
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
    const folders = resolveCompiledFolders(manifest.config, profile);
    const fetchMode = resolveFetchMode(manifest.config, profile);
    const aliased = applyAliases(await fetchCompiledSecrets(provider, envName, folders, fetchMode), folders);
    // The fetch already selected exactly the declared keys per folder; this only
    // enforces that every declared canonical key was produced (unless optional).
    const declaredKeys = [
        ...new Set(folders.flatMap((f) => f.keys.map((k) => k.key))),
    ];
    const merged = selectEmittedSecrets(aliased, declaredKeys, resolveOptionalKeys(manifest.config, envName));
    // filter(Boolean) drops the optional Profile line when absent. It would also
    // drop a trailing "" sentinel, so append the trailing newline explicitly —
    // otherwise the first secret gets glued onto the "# Generated" line.
    const header = `${[
        "# Pulled from Infisical — do not edit. Refresh: infisicml pull",
        `# Package: ${manifest.id}`,
        `# Environment: ${envName}`,
        profile ? `# Profile: ${profile}` : "",
        `# Paths: ${folders.map((f) => normalizeFolderPath(f.path)).join(", ")}`,
        fetchMode === "keys" ? "# Fetch: keys (per-key least-privilege read)" : "",
        `# Generated: ${new Date().toISOString()}`,
    ]
        .filter(Boolean)
        .join("\n")}\n`;
    writeFileSync(outputPath, header + serializeDotenv(merged));
    console.log(`✅ ${manifest.id}: wrote ${rel} (${Object.keys(merged).length} vars)`);
    return "pulled";
}
//# sourceMappingURL=pull.js.map