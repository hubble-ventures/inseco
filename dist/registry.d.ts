import type { ResolvedConfig } from "./config.js";
import { type ManifestFile, type SecretsManifest } from "./manifest.js";
export type PackageManifest = {
    id: string;
    dir: string;
    config: SecretsManifest;
    /** The manifest file this package was loaded from (YAML or JSON). */
    file: ManifestFile;
};
/**
 * Discover every secrets manifest in the repo (YAML preferred, JSON supported),
 * driven entirely by `config.discovery` — no repo-specific directory constants.
 * Explicit `packages` win over `roots`-discovered entries at the same directory.
 */
export declare function discoverManifests(config: ResolvedConfig): PackageManifest[];
//# sourceMappingURL=registry.d.ts.map