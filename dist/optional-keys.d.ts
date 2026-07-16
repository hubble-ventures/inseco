import type { SecretsManifest } from "./manifest.js";
export declare function resolveOptionalKeys(manifest: SecretsManifest, envName: string): string[];
export declare function logMissingOptionalKeys(merged: Record<string, string>, optionalKeys: string[]): void;
//# sourceMappingURL=optional-keys.d.ts.map