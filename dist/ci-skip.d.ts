import type { SecretsManifest } from "./manifest.js";
import type { SecretsProvider } from "./providers/types.js";
export type { SecretsProvider };
export declare function mergeFolderSecrets(chunks: Record<string, string>[]): Record<string, string>;
export declare function fetchSecretsForPaths(provider: SecretsProvider, envName: string, paths: string[]): Promise<Record<string, string>>;
export declare function isCi(): boolean;
export declare function shouldSkipInfisicalPull(manifest: SecretsManifest, force: boolean): boolean;
export declare function keysForCiStub(manifest: SecretsManifest): string[];
//# sourceMappingURL=ci-skip.d.ts.map