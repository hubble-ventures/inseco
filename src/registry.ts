import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ResolvedConfig } from "./config.js";
import {
  hasManifestFile,
  loadManifestFromDir,
  type ManifestFile,
  type SecretsManifest,
} from "./manifest.js";

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
export function discoverPackages(config: ResolvedConfig): PackageRef[] {
  const { repoRoot } = config;
  const byDir = new Map<string, PackageRef>();

  const consider = (dir: string, id: string) => {
    if (!hasManifestFile(dir)) return;
    byDir.set(resolve(dir), { id, dir });
  };

  for (const root of config.discovery.roots ?? []) {
    const rootAbs = join(repoRoot, root);
    if (!existsSync(rootAbs)) continue;
    for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      consider(join(rootAbs, entry.name), entry.name);
    }
  }

  // Explicit packages last so a custom id/dir overrides a roots-discovered one.
  for (const { id, dir } of config.discovery.packages ?? []) {
    consider(join(repoRoot, dir), id);
  }

  return [...byDir.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve, parse, and schema-validate one package's manifest. Throws if the
 * directory is ambiguous (more than one manifest file) or the manifest is
 * invalid — scoped to this package, so an unrelated broken sibling never blocks
 * a command that doesn't load it.
 */
export function loadPackage(ref: PackageRef): PackageManifest {
  const loaded = loadManifestFromDir(ref.dir);
  if (!loaded) {
    // hasManifestFile was true at discovery; the file vanished in between.
    throw new Error(`No secrets manifest in ${ref.dir}`);
  }
  return { id: ref.id, dir: ref.dir, config: loaded.manifest, file: loaded.file };
}

/**
 * Discover and load every package's manifest. Loads all — to load only a
 * targeted subset (so an unrelated ambiguous/broken package can't abort the
 * run), use {@link discoverPackages} + {@link loadPackage} instead.
 */
export function discoverManifests(config: ResolvedConfig): PackageManifest[] {
  return discoverPackages(config).map(loadPackage);
}
