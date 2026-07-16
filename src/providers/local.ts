import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { parseDotenv } from "../dotenv.js";
import { normalizeFolderPath } from "../manifest.js";
import type { SecretsProvider } from "./types.js";

export type SpawnExportFn = (
  command: string,
  args: string[],
  cwd: string
) => SpawnSyncReturns<string>;

export type LocalProviderOptions = {
  projectId: string;
  cwd?: string;
  maxAttempts?: number;
  spawn?: SpawnExportFn;
};

function defaultSpawn(
  command: string,
  args: string[],
  cwd: string
): SpawnSyncReturns<string> {
  return spawnSync(command, args, { encoding: "utf8", cwd });
}

/**
 * Dev-time provider: shells out to the `infisical` CLI using the developer's
 * `infisical login` session. No machine identity or tokens required locally.
 */
export class LocalProvider implements SecretsProvider {
  private readonly projectId: string;
  private readonly cwd: string;
  private readonly maxAttempts: number;
  private readonly spawnFn: SpawnExportFn;

  constructor(options: LocalProviderOptions) {
    this.projectId = options.projectId;
    this.cwd = options.cwd ?? process.cwd();
    this.maxAttempts = options.maxAttempts ?? 4;
    this.spawnFn = options.spawn ?? defaultSpawn;
  }

  async exportFolder(
    envName: string,
    folder: string
  ): Promise<Record<string, string>> {
    const pathArg = normalizeFolderPath(folder);
    let lastMsg = "";

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const result = this.spawnFn(
        "infisical",
        [
          "export",
          `--env=${envName}`,
          `--projectId=${this.projectId}`,
          `--path=${pathArg}`,
          "--format=dotenv",
          "--silent",
        ],
        this.cwd
      );

      if (result.status === 0) {
        return parseDotenv(result.stdout ?? "");
      }

      lastMsg = (result.stderr || result.stdout || "").trim();
      if (attempt < this.maxAttempts) {
        const delay = 2 * attempt;
        await sleepSeconds(delay);
      }
    }

    throw new Error(
      `infisical export failed for ${pathArg} after ${this.maxAttempts} attempts: ${lastMsg || "unknown error"}`
    );
  }
}

function sleepSeconds(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function commandExists(cmd: string): boolean {
  const result = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}
