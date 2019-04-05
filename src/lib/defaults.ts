/**
 * Keep all alphanumerics, dashes, underscores, and dots and replace all other characters with double underscores.
 *
 * @param uploadedAs The raw name that the file was uploaded with.
 */
export function defaultSanitizeFilename(uploadedAs: string): string {
    return `${uploadedAs}`.trim().replace(/[^A-Za-z0-9\-_.]/g, '__');
}

/**
 * Generate a path using the default logic for an instant in time.
 *
 * @param instant
 * @param sanitizedUploadedAs
 */
export function defaultGeneratePathForInstant(
    instant: Date,
    sanitizedUploadedAs: string,
): string {
    const year = `${instant.getUTCFullYear()}`.padStart(4, '0');
    const month = `${instant.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${instant.getUTCDate()}`.padStart(2, '0');
    const hour = `${instant.getUTCHours()}`.padStart(2, '0');
    const minute = `${instant.getUTCMinutes()}`.padStart(2, '0');
    const second = `${instant.getUTCSeconds()}`.padStart(2, '0');
    const ms = `${instant.getUTCMilliseconds()}`.padStart(3, '0');
    return `${year}/${month}/${day}/${hour}${minute}${second}${ms}-${sanitizedUploadedAs}`;
}

/**
 * Generate a path using the default logic, using the current date and time for the path info.
 *
 * @param sanitizedUploadedAs
 */
export function defaultGeneratePath(sanitizedUploadedAs: string): string {
    return defaultGeneratePathForInstant(new Date(), sanitizedUploadedAs);
}
