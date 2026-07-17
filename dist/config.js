import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDotenv } from "./dotenv.js";
/** Identity helper for type-safe `infisicml.config.ts` files. */
export function defineConfig(config) {
    return config;
}
const CONFIG_FILENAMES = [
    "infisicml.config.json",
    "infisicml.config.mjs",
    "infisicml.config.js",
    // Back-compat: the package was previously named `infiscml`. Keep resolving
    // the old config filenames so existing repos don't break on upgrade.
    "infiscml.config.json",
    "infiscml.config.mjs",
    "infiscml.config.js",
];
function findConfigFile(startDir) {
    let dir = resolve(startDir);
    while (true) {
        for (const name of CONFIG_FILENAMES) {
            const candidate = join(dir, name);
            if (existsSync(candidate))
                return { dir, file: candidate };
        }
        const parent = resolve(dir, "..");
        if (parent === dir) {
            throw new Error(`Could not find ${CONFIG_FILENAMES[0]} in any parent of ${startDir}`);
        }
        dir = parent;
    }
}
async function readConfigFile(file) {
    if (file.endsWith(".json")) {
        return JSON.parse(readFileSync(file, "utf8"));
    }
    const mod = (await import(pathToFileURL(file).href));
    if (!mod.default) {
        throw new Error(`${file} must export a default InfisicmlConfig`);
    }
    return mod.default;
}
function resolveProjectId(repoRoot, config) {
    if (config.projectId)
        return config.projectId;
    if (process.env.INFISICAL_PROJECT_ID)
        return process.env.INFISICAL_PROJECT_ID;
    if (config.projectIdEnvFile) {
        const envPath = join(repoRoot, config.projectIdEnvFile);
        if (existsSync(envPath)) {
            const parsed = parseDotenv(readFileSync(envPath, "utf8"));
            if (parsed.INFISICAL_PROJECT_ID)
                return parsed.INFISICAL_PROJECT_ID;
        }
    }
    throw new Error("INFISICAL_PROJECT_ID not resolved — set config.projectId, projectIdEnvFile, or the INFISICAL_PROJECT_ID env var");
}
export async function loadConfig(cwd = process.cwd()) {
    const { dir, file } = findConfigFile(cwd);
    const config = await readConfigFile(file);
    // Project id is only needed by the local (CLI) provider; resolve lazily-ish
    // but tolerate its absence in remote/CI flows that pass a project slug.
    let projectId = "";
    try {
        projectId = resolveProjectId(dir, config);
    }
    catch {
        projectId = "";
    }
    return { ...config, repoRoot: dir, projectId };
}
//# sourceMappingURL=config.js.map