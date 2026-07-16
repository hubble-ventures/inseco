import type { ResolvedConfig } from "./config.js";
import { type SecretsManifest } from "./manifest.js";
export type PackageManifest = {
    id: string;
    dir: string;
    config: SecretsManifest;
};
/**
 * Discover every `secrets.json` in the repo, driven entirely by
 * `config.discovery` — no repo-specific directory constants. Explicit
 * `packages` win over `roots`-discovered entries at the same directory.
 */
export declare function discoverManifests(config: ResolvedConfig): PackageManifest[];
//# sourceMappingURL=registry.d.ts.map