export type PullOptions = {
    ids: string[];
    env: string;
    profile?: string;
    force: boolean;
    here: boolean;
    turbo: boolean;
    cwd?: string;
};
export declare function runPull(options: PullOptions): Promise<void>;
//# sourceMappingURL=pull.d.ts.map