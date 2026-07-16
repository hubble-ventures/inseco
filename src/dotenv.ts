/**
 * Parse and serialize dotenv-format secret files.
 */

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function serializeDotenv(vars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(vars).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const needsQuotes = /[\s"'$`#\\]/.test(value);
    lines.push(`${key}=${needsQuotes ? JSON.stringify(value) : value}`);
  }
  return `${lines.join("\n")}\n`;
}
