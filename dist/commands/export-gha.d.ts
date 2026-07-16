export type ExportGhaOptions = {
    packageId: string;
    env: string;
    profile?: string;
    cwd?: string;
    githubEnvPath?: string;
    projectSlug?: string;
    identityId?: string;
};
export declare function runExportGha(options: ExportGhaOptions): Promise<void>;
//# sourceMappingURL=export-gha.d.ts.map