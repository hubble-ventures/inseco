import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDotenv } from "./dotenv.js";

/**
 * How Inseco discovers per-package `secrets.json` manifests. Discovery is
 * driven entirely by config, so no repo layout is baked into the tool.
 */
export type DiscoveryConfig = {
  /**
   * Parent directories scanned one level deep. Any immediate child directory
   * containing a `secrets.json` becomes a package whose id is the child dir
   * name (e.g. `roots: ["nextjs-apps", "vite-apps"]`).
   */
  roots?: string[];
  /** Explicit packages with custom ids (e.g. `{ id: "postgres", dir: "infra/postgres" }`). */
  packages?: { id: string; dir: string }[];
};

/**
 * Advertise a subset of a package's secret KEY NAMES (never values) to
 * GITHUB_ENV as a plain, comma-separated var. A deploy step reads it and
 * forwards exactly those keys (e.g. `flyctl secrets import`, `gcloud`,
 * `wrangler secret`), so `secrets.json` stays the source of truth for what a
 * deploy forwards — no hand-maintained allowlist in the workflow.
 */
export type AdvertiseKeysHook = {
  /** Env var name to write the comma-separated key list to. */
  envVar: string;
  /**
   * `runtime` (default): only keys from the manifest's base `paths` — the app's
   *   runtime secrets, excluding profile-only deploy credentials.
   * `all`: every canonical key across the resolved (profile) paths.
   */
  scope?: "runtime" | "all";
};

export type InsecoConfig = {
  /** Infisical project id for the local CLI provider. */
  projectId?: string;
  /** dotenv file (relative to repo root) providing INFISICAL_PROJECT_ID. */
  projectIdEnvFile?: string;
  /** Infisical API domain (self-hosted). Defaults to https://app.infisical.com. */
  infisicalDomain?: string;
  discovery: DiscoveryConfig;
  auth?: {
    /** OIDC audience bound to the machine identity (CI). */
    oidcAudience?: string;
  };
  hooks?: {
    advertiseKeys?: AdvertiseKeysHook[];
  };
};

export type ResolvedConfig = InsecoConfig & {
  repoRoot: string;
  projectId: string;
};

/** Identity helper for type-safe `inseco.config.ts` files. */
export function defineConfig(config: InsecoConfig): InsecoConfig {
  return config;
}

const CONFIG_FILENAMES = [
  "inseco.config.json",
  "inseco.config.mjs",
  "inseco.config.js",
];

function findConfigFile(startDir: string): { dir: string; file: string } {
  let dir = resolve(startDir);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return { dir, file: candidate };
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      throw new Error(
        `Could not find ${CONFIG_FILENAMES[0]} in any parent of ${startDir}`
      );
    }
    dir = parent;
  }
}

async function readConfigFile(file: string): Promise<InsecoConfig> {
  if (file.endsWith(".json")) {
    return JSON.parse(readFileSync(file, "utf8")) as InsecoConfig;
  }
  const mod = (await import(pathToFileURL(file).href)) as {
    default?: InsecoConfig;
  };
  if (!mod.default) {
    throw new Error(`${file} must export a default InsecoConfig`);
  }
  return mod.default;
}

function resolveProjectId(repoRoot: string, config: InsecoConfig): string {
  if (config.projectId) return config.projectId;
  if (process.env.INFISICAL_PROJECT_ID) return process.env.INFISICAL_PROJECT_ID;
  if (config.projectIdEnvFile) {
    const envPath = join(repoRoot, config.projectIdEnvFile);
    if (existsSync(envPath)) {
      const parsed = parseDotenv(readFileSync(envPath, "utf8"));
      if (parsed.INFISICAL_PROJECT_ID) return parsed.INFISICAL_PROJECT_ID;
    }
  }
  throw new Error(
    "INFISICAL_PROJECT_ID not resolved — set config.projectId, projectIdEnvFile, or the INFISICAL_PROJECT_ID env var"
  );
}

export async function loadConfig(cwd = process.cwd()): Promise<ResolvedConfig> {
  const { dir, file } = findConfigFile(cwd);
  const config = await readConfigFile(file);
  // Project id is only needed by the local (CLI) provider; resolve lazily-ish
  // but tolerate its absence in remote/CI flows that pass a project slug.
  let projectId = "";
  try {
    projectId = resolveProjectId(dir, config);
  } catch {
    projectId = "";
  }
  return { ...config, repoRoot: dir, projectId };
}
