export type KeysOptions = {
    /** A single package id; omitted with `--all`. */
    packageId?: string;
    profile?: string;
    all: boolean;
    json: boolean;
    check: boolean;
    cwd?: string;
};
export declare function runKeys(options: KeysOptions): Promise<void>;
//# sourceMappingURL=keys.d.ts.map