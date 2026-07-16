export interface SecretsProvider {
    exportFolder(envName: string, folder: string): Promise<Record<string, string>>;
}
//# sourceMappingURL=types.d.ts.map