export type DiffOptions = {
    /** A single package id; omitted with `--all`. */
    packageId?: string;
    /** A git ref or (per-package only) a manifest file path. */
    from: string;
    to: string;
    profile?: string;
    all: boolean;
    json: boolean;
    /** Exit non-zero when any key changed (like `git diff --exit-code`). */
    exitCode: boolean;
    cwd?: string;
};
/** Per-(package, profile) result. `null` sides mean the manifest was absent there. */
type ProfileDiff = {
    package: string;
    profile: string;
    fromPresent: boolean;
    toPresent: boolean;
    added: string[];
    removed: string[];
};
type DiffReport = {
    results: ProfileDiff[];
    warnings: string[];
};
export declare function runDiff(options: DiffOptions): Promise<number>;
export type { ProfileDiff, DiffReport };
//# sourceMappingURL=diff.d.ts.map