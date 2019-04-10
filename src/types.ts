import { DiskManager, DiskManagerConfig } from '@carimus/node-disks';

/**
 * Represents a file stored on a disk that the uploads service knows about.
 */
export interface UploadedFile {
    /**
     * The disk that the file lives on.
     */
    disk: string,
    /**
     * The path on the disk that the file lives at.
     */
    path: string,
    /**
     * The sanitized filename that the file was uploaded with.
     */
    uploadedAs: string,
}

/**
 * Represents optional metadata surrounding an upload that typically should be persisted with the information about
 * where the file was stored.
 */
export interface UploadMeta {
    /**
     * The upload context, whatever that means for the application. I.e. `'user_profile'`, `'company_logo'`, or `'*'`
     */
    context?: string,

    /**
     * Allow any other keys.
     */
    [key: string]: any,
}

/**
 * An implementation that can read, create, update, and delete Uploads, typically to persist them to a database.
 */
export interface UploadRepository<Upload> {
    /**
     * Create an Upload from file upload info and meta info.
     *
     * If this method returns a promise, it will be waited on.
     *
     * @param uploadedFile
     * @param meta
     */
    create: (uploadedFile: UploadedFile, meta?: UploadMeta) => Promise<Upload> | Upload,

    /**
     * Update an existing Upload from file upload info and meta info.
     *
     * If this method returns a promise, it will be waited on.
     *
     * @param upload
     * @param newUploadedFile
     * @param newMeta
     */
    update: (upload: Upload, newUploadedFile: UploadedFile, newMeta?: UploadMeta) => Promise<Upload> | Upload,

    /**
     * Delete an upload.
     *
     * If this method returns a promise, it will be waited on.
     *
     * @param upload
     */
    delete: (upload: Upload) => Promise<void> | void,

    /**
     * Get the uploaded file info that an upload is associated with so that it can be tracked down.
     *
     * If this method returns a promise, it will be waited on.
     *
     * @param upload
     */
    getUploadedFileInfo: (upload: Upload) => Promise<UploadedFile> | UploadedFile,

    /**
     * Get the meta info for an upload that was stored in the repository.
     *
     * @param upload
     */
    getMeta: (upload: Upload) => Promise<UploadMeta> | UploadMeta,
}

/**
 * The configuration for the uploads service.
 */
export interface UploadsConfig<Upload> {
    /**
     * A `node-disks` `DiskManager` instance to use OR a config object that can
     * be used to initialize one.
     */
    disks: DiskManager | DiskManagerConfig,

    /**
     * The repository used to interact with Uploads.
     *
     * @see UploadRepository
     */
    repository: UploadRepository<Upload>,

    /**
     * The default disk to use for storing new uploads.
     *
     * Default: `'default'`.
     */
    defaultDisk?: string,

    /**
     * A function that sanitizes a raw filename provided by the client for an upload being stored.
     *
     * @see defaultSanitizeFilename
     *
     * Default: Allow alphanumerics, dashes, underscores, dots, and spaces. Replace all remaining characters with
     * `'__'`.
     */
    sanitizeFilename?: (uploadedAs: string) => string,

    /**
     * Generate the full path for an upload being stored given the already sanitized filename for the upload.
     *
     * @see defaultGeneratePath
     *
     * Default: Using the current year, month, and date for the directories and then prefixing the filename with the
     * current time of day accurate to the millisecond. For example: `2018/12/02/225423029-foo.png`
     */
    generatePath?: (sanitizedUploadedAs: string) => string,

    /**
     * The root storage path for uploads on the selected storage disk. This prefix is included in the path stored in
     * the database so this value can be changed and will only affect new uploads. If all of the existing uploads
     * are moved into a subdirectory of the current storage disk, change the root of the storage disk instead. More
     * complex scenarios will likely require creating a new disk to store old uploads vs. new uploads. This option
     * is particularly useful to isolate / namespace your uploads from another developer's uploads if you're using
     * the same remote s3 bucket for example.
     *
     * Default to: `''` (no prefix)
     */
    pathPrefix?: string,
}
