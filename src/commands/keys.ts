import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import {
  buildSnapshot,
  diffKeyNames,
  emittedNamesFor,
  hasKeyChange,
  KEYS_SCHEMA_VERSION,
  type KeysSnapshot,
  serializeSnapshot,
} from "../keys.js";
import { discoverManifests, discoverPackages, loadPackage } from "../registry.js";

// The committed snapshot / lockfile name, at the repo root.
const SNAPSHOT_FILENAME = "infisicml.keys.json";

export type KeysOptions = {
  /** A single package id; omitted with `--all`. */
  packageId?: string;
  profile?: string;
  all: boolean;
  json: boolean;
  check: boolean;
  cwd?: string;
};

export async function runKeys(options: KeysOptions): Promise<void> {
  validateOptions(options);
  const config = await loadConfig(options.cwd);

  if (options.all) {
    const snapshot = buildSnapshot(discoverManifests(config));
    if (options.check) {
      checkSnapshot(config.repoRoot, snapshot);
      return;
    }
    if (options.json) {
      process.stdout.write(serializeSnapshot(snapshot));
    } else {
      printSnapshotText(snapshot);
    }
    return;
  }

  const ref = discoverPackages(config).find((p) => p.id === options.packageId);
  if (!ref) throw new Error(`Unknown package id: ${options.packageId}`);
  const manifest = loadPackage(ref);
  const emitted = emittedNamesFor(manifest.config, options.profile);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        id: manifest.id,
        profile: options.profile ?? null,
        mode: "static",
        schemaVersion: KEYS_SCHEMA_VERSION,
        emitted,
      })}\n`
    );
    return;
  }

  // Mode note on stderr so stdout stays pure names — pipe/paste-friendly, and
  // safe to log: names only, no vault access (see ADR 0001).
  const profileNote = options.profile ? ` [${options.profile}]` : "";
  console.error(
    `# ${manifest.id}${profileNote}: declared emitted keys (static; no vault access)`
  );
  for (const name of emitted) console.log(name);
}

/**
 * Guard the flag combinations. `--env` is deliberately not a defined option (see
 * ADR 0001 §2): static names never depend on the environment, so `parseArgs`
 * rejects `--env` as unknown rather than silently ignoring it.
 */
function validateOptions(options: KeysOptions): void {
  if (options.all) {
    if (options.packageId) {
      throw new Error("keys --all takes no package id");
    }
    if (options.profile) {
      throw new Error("keys --all enumerates every profile; drop --profile");
    }
  } else {
    if (!options.packageId) {
      throw new Error("keys requires a package id (or --all)");
    }
    if (options.check) {
      throw new Error("keys --check requires --all");
    }
  }
}

function checkSnapshot(repoRoot: string, current: KeysSnapshot): void {
  const path = join(repoRoot, SNAPSHOT_FILENAME);
  if (!existsSync(path)) {
    throw new Error(
      `No ${SNAPSHOT_FILENAME} to check against. Create it:\n` +
        `  infisicml keys --all --json > ${SNAPSHOT_FILENAME}`
    );
  }

  const committed = JSON.parse(readFileSync(path, "utf8")) as KeysSnapshot;
  if (committed.schemaVersion !== current.schemaVersion) {
    throw new Error(
      `${SNAPSHOT_FILENAME} schemaVersion ${committed.schemaVersion} != ` +
        `${current.schemaVersion}; regenerate it: infisicml keys --all --json > ${SNAPSHOT_FILENAME}`
    );
  }

  const drift = diffSnapshots(committed, current);
  if (drift.length === 0) {
    console.log(`✅ ${SNAPSHOT_FILENAME} in sync`);
    return;
  }

  console.error(`❌ ${SNAPSHOT_FILENAME} is out of date:`);
  for (const line of drift) console.error(`   ${line}`);
  throw new Error(
    `emitted key set drifted from ${SNAPSHOT_FILENAME}. ` +
      `Review the change, then refresh: infisicml keys --all --json > ${SNAPSHOT_FILENAME}`
  );
}

/** Human-readable drift lines between a committed and a freshly computed snapshot. */
function diffSnapshots(
  committed: KeysSnapshot,
  current: KeysSnapshot
): string[] {
  const lines: string[] = [];
  const ids = [
    ...new Set([
      ...Object.keys(committed.packages),
      ...Object.keys(current.packages),
    ]),
  ].sort();

  for (const id of ids) {
    const before = committed.packages[id];
    const after = current.packages[id];
    if (!before) {
      lines.push(`+ package ${id} (new)`);
      continue;
    }
    if (!after) {
      lines.push(`- package ${id} (removed)`);
      continue;
    }
    const profiles = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort();
    for (const profile of profiles) {
      const diff = diffKeyNames(before[profile] ?? [], after[profile] ?? []);
      if (!hasKeyChange(diff)) continue;
      for (const k of diff.added) lines.push(`+ ${id} ${profile}: ${k}`);
      for (const k of diff.removed) lines.push(`- ${id} ${profile}: ${k}`);
    }
  }
  return lines;
}

function printSnapshotText(snapshot: KeysSnapshot): void {
  for (const [id, profiles] of Object.entries(snapshot.packages)) {
    console.log(`  ${id}:`);
    for (const [profile, names] of Object.entries(profiles)) {
      console.log(`    ${profile}: ${names.join(", ")}`);
    }
  }
}
