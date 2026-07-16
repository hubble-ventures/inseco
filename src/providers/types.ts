export interface SecretsProvider {
  exportFolder(
    envName: string,
    folder: string
  ): Promise<Record<string, string>>;
}
