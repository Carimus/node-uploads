/**
 * Remove all whitespace and slashes from the beginning and end of a string.
 *
 * @param path
 */
export function trimPath(path: string): string {
    return `${path}`.replace(/(^(\s|\/)+|(\s|\/)+$)/g, '');
}
