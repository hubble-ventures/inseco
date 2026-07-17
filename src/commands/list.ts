import { loadConfig } from "../config.js";
import {
  normalizeFolderPath,
  resolveCompiledFolders,
  resolveFetchMode,
} from "../manifest.js";
import { discoverManifests } from "../registry.js";
import type { CompiledFolder } from "../tree.js";

function printFolders(folders: CompiledFolder[], indent: string): void {
  for (const folder of folders) {
    console.log(`${indent}${normalizeFolderPath(folder.path)}`);
    for (const key of folder.keys) {
      const alias =
        key.aliases.length > 0 ? ` → ${key.aliases.join(", ")}` : "";
      console.log(`${indent}  ${key.key}${alias}`);
    }
  }
}

export async function runList(cwd?: string): Promise<void> {
  const config = await loadConfig(cwd);
  const manifests = discoverManifests(config);

  for (const { id, config: m } of manifests) {
    const fetch = resolveFetchMode(m);
    console.log(`  ${id}${fetch === "keys" ? " (fetch: keys)" : ""}:`);
    printFolders(resolveCompiledFolders(m), "    ");
    for (const name of Object.keys(m.profiles ?? {})) {
      const profileFetch = resolveFetchMode(m, name);
      console.log(
        `    [${name}]${profileFetch === "keys" ? " (fetch: keys)" : ""}:`
      );
      printFolders(resolveCompiledFolders(m, name), "      ");
    }
  }
}
