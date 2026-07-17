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
    /**
     * Fetch only the named keys from a folder via `infisical secrets get`. Probes
     * one key at a time so that a key absent from this folder (the CLI exits
     * non-zero) is isolated and skipped, rather than failing the whole batch —
     * keys legitimately live across the manifest's several `paths`. A key found
     * here is recorded; a non-zero exit means "not in this folder," so the caller
     * merges results across folders and enforces genuine absence downstream.
     */
    exportKeys(envName: string, folder: string, keys: string[]): Promise<Record<string, string>>;
}
export declare function commandExists(cmd: string): boolean;
//# sourceMappingURL=local.d.ts.map