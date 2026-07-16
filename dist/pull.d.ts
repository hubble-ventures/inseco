import type { SecretsProvider } from "./providers/types.js";
import type { PackageManifest } from "./registry.js";
export type PullResult = "pulled" | "skipped";
export type PullManifestOptions = {
    manifest: PackageManifest;
    repoRoot: string;
    envName: string;
    profile?: string;
    force?: boolean;
    turboMode?: boolean;
    provider: SecretsProvider;
};
export declare function writeInjectedSecretsStub(outputPath: string, manifest: PackageManifest, keys: string[]): void;
export declare function pullManifest(options: PullManifestOptions): Promise<PullResult>;
//# sourceMappingURL=pull.d.ts.map