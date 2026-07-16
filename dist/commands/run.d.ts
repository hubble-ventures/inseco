export type RunOptions = {
    packageId: string;
    profile?: string;
    env: string;
    command: string[];
    cwd?: string;
};
export declare function runExec(options: RunOptions): Promise<number>;
//# sourceMappingURL=run.d.ts.map