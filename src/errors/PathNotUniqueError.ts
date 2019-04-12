export class PathNotUniqueError extends Error {
    public constructor(
        disk: string,
        oldPath: string,
        newPath: string,
        operation: string,
    ) {
        super(
            `Generated path is not unique on the same disk during ${operation}: ` +
                `'${oldPath}' -> '${newPath}'. If you provided a custom \`generatePath\` function, ensure it` +
                `always generates unique paths (i.e. include a timestamp).`,
        );
    }
}
