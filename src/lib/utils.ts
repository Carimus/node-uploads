import tmp = require('tmp');

/**
 * Remove all whitespace and slashes from the beginning and end of a string.
 *
 * @param path
 */
export function trimPath(path: string): string {
    return `${path}`.replace(/(^(\s|\/)+|(\s|\/)+$)/g, '');
}

/**
 * Create a temp file and do something with it.
 *
 * @param execute An optionally async function that will receive the temp file's name (path)
 * @param skipCleanup If true, don't delete the file until process end.
 * @param extraOptions Additional options to pass into `tmp.file`
 * @return The temporary's file path which won't exist after this resolves unless `skipCleanup` was `true`
 */
export async function withTempFile(
    execute: (name: string) => Promise<void> | void,
    skipCleanup: boolean = false,
    extraOptions: import('tmp').FileOptions = {},
): Promise<string> {
    // Receive the temp file's name (path) and cleanup function from `tmp`, throwing if it rejects.
    const {
        name,
        cleanupCallback,
    }: { name: string; cleanupCallback: () => void } = await new Promise(
        (resolve, reject) => {
            tmp.file(
                { discardDescriptor: true, ...extraOptions },
                (err, name, fd, cleanupCallback) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ name, cleanupCallback });
                    }
                },
            );
        },
    );
    // Run the execute callback with the name (path)
    await execute(name);
    // Don't delete the file if requested.
    if (!skipCleanup) {
        await cleanupCallback();
    }
    // Return the temporary file's name (path)
    return name;
}
