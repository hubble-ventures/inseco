export interface SecretsProvider {
  /**
   * Read every secret in a folder (whole-folder read — `fetch: "folder"`).
   */
  exportFolder(
    envName: string,
    folder: string
  ): Promise<Record<string, string>>;

  /**
   * Read only the named keys from a folder (`fetch: "keys"` — wire-level least
   * privilege). Keys absent from this folder are omitted from the result, not
   * an error: a key may live in a different folder, or not exist at all (the
   * caller's `include` enforcement decides whether absence is fatal).
   */
  exportKeys(
    envName: string,
    folder: string,
    keys: string[]
  ): Promise<Record<string, string>>;
}
