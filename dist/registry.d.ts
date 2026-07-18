import type { ResolvedConfig } from "./config.js";
import { type ManifestFile, type SecretsManifest } from "./manifest.js";
/** A discovered package: its id and directory, before its manifest is loaded. */
export type PackageRef = {
    id: string;
    dir: string;
};
export type PackageManifest = PackageRef & {
    config: SecretsManifest;
    /** The manifest file this package was loaded from (YAML or JSON). */
    file: ManifestFile;
};
/**
 * Enumerate every package directory that holds a secrets manifest, driven
 * entirely by `config.discovery` — no repo-specific directory constants.
 * Explicit `packages` win over `roots`-discovered entries at the same directory.
 *
 * This is a cheap presence scan: it does NOT parse, validate, or resolve
 * manifest ambiguity, so a stale or malformed manifest in one package never
 * blocks discovery of the others. Resolution happens in {@link loadPackage},
 * per package, only for the packages a command actually uses.
 */
export declare function discoverPackages(config: ResolvedConfig): PackageRef[];
/**
 * Resolve, parse, and schema-validate one package's manifest. Throws if the
 * directory is ambiguous (more than one manifest file) or the manifest is
 * invalid — scoped to this package, so an unrelated broken sibling never blocks
 * a command that doesn't load it.
 */
export declare function loadPackage(ref: PackageRef): PackageManifest;
/**
 * Discover and load every package's manifest. Loads all — to load only a
 * targeted subset (so an unrelated ambiguous/broken package can't abort the
 * run), use {@link discoverPackages} + {@link loadPackage} instead.
 */
export declare function discoverManifests(config: ResolvedConfig): PackageManifest[];
//# sourceMappingURL=registry.d.ts.map