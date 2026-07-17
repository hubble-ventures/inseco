import type { SecretsManifest } from "./manifest.js";
import type { SecretsProvider } from "./providers/types.js";
import type { CompiledFolder } from "./tree.js";
export type { SecretsProvider };
export declare function mergeFolderSecrets(chunks: Record<string, string>[]): Record<string, string>;
/**
 * Fetch a manifest's secrets from its compiled folders, honoring the resolved
 * `fetch` mode, and select each folder's declared keys from *that* folder
 * (provenance-aware). `keys` mode requests only the declared keys per folder
 * (the tree names the exact canonical vault keys, so no allowlist reverse-map is
 * needed — the alias *source* is the real key); `folder` mode reads the whole
 * folder and picks the declared keys locally. Folders merge in tree order, so a
 * genuine cross-folder name collision resolves last-wins.
 *
 * Callers pass an explicit `folders` subset (export-gha splits runtime vs
 * deploy-only) rather than re-deriving it, so the provenance the caller already
 * computed is preserved.
 */
export declare function fetchCompiledSecrets(provider: SecretsProvider, envName: string, folders: CompiledFolder[], fetchMode: "folder" | "keys"): Promise<Record<string, string>>;
export declare function isCi(): boolean;
export declare function shouldSkipInfisicalPull(manifest: SecretsManifest, force: boolean): boolean;
export declare function keysForCiStub(manifest: SecretsManifest): string[];
//# sourceMappingURL=ci-skip.d.ts.map