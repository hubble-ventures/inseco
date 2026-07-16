import { type SpawnSyncReturns } from "node:child_process";
import type { SecretsProvider } from "./types.js";
export type SpawnExportFn = (command: string, args: string[], cwd: string) => SpawnSyncReturns<string>;
export type LocalProviderOptions = {
    projectId: string;
    cwd?: string;
    maxAttempts?: number;
    spawn?: SpawnExportFn;
};
/**
 * Dev-time provider: shells out to the `infisical` CLI using the developer's
 * `infisical login` session. No machine identity or tokens required locally.
 */
export declare class LocalProvider implements SecretsProvider {
    private readonly projectId;
    private readonly cwd;
    private readonly maxAttempts;
    private readonly spawnFn;
    constructor(options: LocalProviderOptions);
    exportFolder(envName: string, folder: string): Promise<Record<string, string>>;
}
export declare function commandExists(cmd: string): boolean;
//# sourceMappingURL=local.d.ts.map