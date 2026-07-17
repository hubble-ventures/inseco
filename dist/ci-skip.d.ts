import { type SecretsManifest } from "./manifest.js";
import type { SecretsProvider } from "./providers/types.js";
export type { SecretsProvider };
export declare function mergeFolderSecrets(chunks: Record<string, string>[]): Record<string, string>;
export declare function fetchSecretsForPaths(provider: SecretsProvider, envName: string, paths: string[]): Promise<Record<string, string>>;
/**
 * `fetch: "keys"` counterpart to {@link fetchSecretsForPaths}: request only the
 * given canonical keys from each folder and merge. A key absent from one folder
 * is simply not returned by that folder; the merge (last folder wins, matching
 * the folder path) collects it from whichever folder holds it.
 */
export declare function fetchSecretsForKeys(provider: SecretsProvider, envName: string, paths: string[], keys: string[]): Promise<Record<string, string>>;
/**
 * Fetch a manifest's secrets for the given folder set, honoring its resolved
 * `fetch` mode: `keys` requests only the canonical keys `include` resolves to
 * (least privilege at the wire), `folder` reads whole folders. `keys` requires
 * an `include` allowlist — the whole point is to name exactly what to fetch.
 *
 * Callers pass an explicit `paths` subset (export-gha splits runtime vs
 * deploy-only) rather than re-deriving it, so the runtime/deploy provenance the
 * caller already computed is preserved.
 */
export declare function fetchManifestSecrets(provider: SecretsProvider, envName: string, paths: string[], manifest: SecretsManifest, profile?: string): Promise<Record<string, string>>;
export declare function isCi(): boolean;
export declare function shouldSkipInfisicalPull(manifest: SecretsManifest, force: boolean): boolean;
export declare function keysForCiStub(manifest: SecretsManifest): string[];
//# sourceMappingURL=ci-skip.d.ts.map