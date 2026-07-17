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
     * Select only the named keys from a folder.
     *
     * The `infisical` CLI has no true single-secret *server* fetch — `secrets get`
     * pulls the whole folder from the API and filters client-side (running it per
     * key would transfer the folder once per key). So we fetch the folder once via
     * {@link exportFolder} and select the requested keys locally. This means the
     * **wire-level** least-privilege guarantee holds only for the CI/REST lane
     * ({@link RemoteProvider}); the local lane narrows what's *written*, not what
     * the vault transmits. Crucially, it also inherits `exportFolder`'s retry and
     * its clear `"infisical export failed…"` error, so a transient CLI failure
     * throws an infrastructure error rather than silently dropping keys into the
     * generic "not produced by any folder" path.
     */
    exportKeys(envName: string, folder: string, keys: string[]): Promise<Record<string, string>>;
}
export declare function commandExists(cmd: string): boolean;
//# sourceMappingURL=local.d.ts.map