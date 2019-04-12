import { Readable } from 'stream';
import { DiskManager } from '@carimus/node-disks';
import { InvalidConfigError, PathNotUniqueError } from '../errors';
import {
    UploadedFile,
    UploadMeta,
    UploadRepository,
    UploadsConfig,
} from '../types';
import { trimPath } from './utils';
import { defaultSanitizeFilename, defaultGeneratePath } from './defaults';

/**
 * A service for handling uploaded files.
 */
export class Uploads<Upload> {
    private config: UploadsConfig<Upload>;
    private repository: UploadRepository<Upload>;
    private disks: DiskManager;

    public constructor(config: UploadsConfig<Upload>) {
        this.config = config;
        this.repository = config.repository;
        if (typeof config.disks === 'object') {
            this.disks =
                config.disks instanceof DiskManager
                    ? config.disks
                    : new DiskManager(config.disks);
        } else {
            throw new InvalidConfigError(['disks']);
        }
    }

    /**
     * Sanitize a client provided filename before storing on the disk.
     *
     * @param uploadedAs
     */
    public sanitizeFilename(uploadedAs: string): string {
        return this.config.sanitizeFilename
            ? this.config.sanitizeFilename(uploadedAs)
            : defaultSanitizeFilename(uploadedAs);
    }

    /**
     * Generate a timestamped unique path and filename based on the client-provided filename.
     *
     * @param sanitizedUploadedAs
     */
    public generatePath(sanitizedUploadedAs: string): string {
        return this.config.generatePath
            ? this.config.generatePath(sanitizedUploadedAs)
            : defaultGeneratePath(sanitizedUploadedAs);
    }

    /**
     * Get the full final storage path on the disk for an upload being stored based off of the sanitized filename
     * and the configuration path prefix.
     *
     * @param sanitizedUploadedAs
     */
    public generateStoragePath(sanitizedUploadedAs: string): string {
        const path = this.generatePath(sanitizedUploadedAs);
        return `/${trimPath(`${this.config.pathPrefix || ''}/`)}${trimPath(
            path,
        )}`;
    }

    /**
     * Get the default disk name based on config.
     */
    private getDefaultDiskName(): string {
        return this.config.defaultDisk || 'default';
    }

    /**
     * Take the file data and raw client-provided filename and place that file on the disk in the proper
     * location by sanitizing the filename and generating a unique path for it.
     *
     * This doesn't touch the repository. Use `upload` to perform legitimate uploads.
     *
     * @see upload
     *
     * @param fileData
     * @param uploadedAs
     * @param diskName
     */
    public async place(
        fileData: Buffer | Readable,
        uploadedAs: string,
        diskName: string = this.getDefaultDiskName(),
    ): Promise<UploadedFile> {
        // Generate a filename and path.
        const sanitizedUploadedAs = this.sanitizeFilename(uploadedAs);
        const path = this.generateStoragePath(sanitizedUploadedAs);
        // Grab a disk instance and write the data to the disk.
        const disk = this.disks.getDisk(diskName);
        await disk.write(path, fileData);
        // Return a record representing the uploaded file and where it lives on the disk.
        return {
            disk: disk.getName() || diskName,
            path,
            uploadedAs: sanitizedUploadedAs,
        };
    }

    /**
     * Take an uploaded file and copy it to a new unique generated location on the default disk (or the specified disk,
     * regardless of the source disk). By default the path will be regenerated but this can be disabled, noting that
     * without regeneration, it will still use the old pathPrefix and not any new one if its changed in the config
     * (since the pathPrefix is applied during the generation of the filename).
     *
     * TODO Once @carimus/node-disks supports the copy operation, use that when oldDisk === newDisk
     *
     * @param originalFile
     * @param newDiskName
     * @param regeneratePath
     */
    public async copy(
        originalFile: UploadedFile,
        newDiskName: string = this.getDefaultDiskName(),
        regeneratePath: boolean = true,
    ): Promise<UploadedFile> {
        // Resolve the disks
        const newDisk = this.disks.getDisk(newDiskName);
        const originalDisk = this.disks.getDisk(originalFile.disk);

        // Clone the original file upload info, setting the new disk and regenerating the path.
        const newFile: UploadedFile = {
            ...originalFile,
            disk: newDisk.getName() || newDiskName,
            path: regeneratePath
                ? this.generateStoragePath(originalFile.uploadedAs)
                : originalFile.path,
        };

        // Throw if the locations are exactly the same.
        if (
            originalFile.disk === newFile.disk &&
            originalFile.path === newFile.path
        ) {
            throw new PathNotUniqueError(
                originalFile.disk,
                originalFile.path,
                newFile.path,
                'copy',
            );
        }

        // Perform the copy
        await newDisk.write(
            newFile.path,
            await originalDisk.createReadStream(originalFile.path),
        );

        // Return the newly uploaded file
        return newFile;
    }

    /**
     * Place an uploaded file on the disk and create it in the repository.
     *
     * @param fileData
     * @param uploadedAs
     * @param meta
     * @param diskName
     */
    public async upload(
        fileData: Buffer | Readable,
        uploadedAs: string,
        meta: UploadMeta | null = null,
        diskName?: string,
    ): Promise<Upload> {
        const uploadedFile = await this.place(fileData, uploadedAs, diskName);
        return meta
            ? this.repository.create(uploadedFile, meta)
            : this.repository.create(uploadedFile);
    }

    /**
     * Update an existing upload with a new uploaded file by placing the new file and deleting the old file, updating
     * the upload itself in the repository.
     *
     * @param upload
     * @param fileData
     * @param uploadedAs
     * @param meta
     * @param diskName
     */
    public async update(
        upload: Upload,
        fileData: Buffer | Readable,
        uploadedAs: string,
        meta: UploadMeta | null = null,
        diskName?: string,
    ): Promise<Upload> {
        // Get the info about the old file and resolve its disk.
        const oldFile = await this.repository.getUploadedFileInfo(upload);
        const oldDisk = this.disks.getDisk(oldFile.disk);

        // Place the new file on the default disk
        const newFile = await this.place(fileData, uploadedAs, diskName);

        // Delete the old file from the old disk
        await oldDisk.delete(oldFile.path);

        // Update the upload in the repository with the new file's data.
        return meta
            ? this.repository.update(upload, newFile, meta)
            : this.repository.update(upload, newFile);
    }

    /**
     * Duplicate an existing upload to the default disk no matter what the current uploads disk is and create it in
     * the repository.
     *
     * This will regenerate the path even if the upload is remaining on the same disk by default.
     *
     * The original upload will not be touched.
     *
     * @param original
     * @param meta
     * @param newDiskName
     * @param regeneratePath
     */
    public async duplicate(
        original: Upload,
        meta: UploadMeta | null = null,
        newDiskName?: string,
        regeneratePath: boolean = true,
    ): Promise<Upload> {
        // Ask the repository for info on where and how the original upload file is stored.
        const originalFile = await this.repository.getUploadedFileInfo(
            original,
        );

        // Copy the original file to the new file location.
        const newFile = await this.copy(
            originalFile,
            newDiskName,
            regeneratePath,
        );

        // Store the new upload in the repository and return it
        return this.repository.create(
            newFile,
            meta || (await this.repository.getMeta(original)),
        );
    }

    /**
     * Transfer an upload from its current disk to a new disk, defaulting to the configured default disk. By default,
     * its path will not be regenerated.
     *
     * This will update the upload in the repository
     *
     * @param upload
     * @param newDiskName
     * @param newMeta New meta to use for the upload.
     * @param regeneratePath
     * @return The upload if the file was transferred, false if it was not (same disk and path / no op)
     */
    public async transfer(
        upload: Upload,
        newDiskName?: string,
        newMeta: UploadMeta | null = null,
        regeneratePath: boolean = false,
    ): Promise<Upload | false> {
        // Get the details of where the old file is stored.
        const oldFile = await this.repository.getUploadedFileInfo(upload);

        // Copy the old file to the new disk at the old path (or regenerate the path if specified)
        let newFile = null;
        try {
            newFile = await this.copy(oldFile, newDiskName, regeneratePath);
        } catch (error) {
            if (error instanceof PathNotUniqueError) {
                return false;
            }
            throw error;
        }

        // Update the upload in the repository with the new file data
        return newMeta
            ? this.repository.update(upload, newFile, newMeta)
            : this.repository.update(upload, newFile);
    }

    /**
     * Delete an uploaded file from the disk.
     *
     * @param upload
     * @param onlyFile If true, only thd disk file is deleted and not the upload in the repository.
     */
    public async delete(
        upload: Upload,
        onlyFile: boolean = false,
    ): Promise<void> {
        // Ask the repository for info on where and how the upload file is stored.
        const file = await this.repository.getUploadedFileInfo(upload);

        // Resolve the disk for the file
        const disk = this.disks.getDisk(file.disk);

        // Delete the upload in the repository before deleting it on the disk
        if (!onlyFile) {
            await this.repository.delete(upload);
        }

        // Delete the file on the disk
        await disk.delete(file.path);
    }

    /**
     * Read an upload's data into memory.
     *
     * @param upload
     */
    public async read(upload: Upload): Promise<Buffer> {
        // Ask the repository for info on where and how the upload file is stored.
        const file = await this.repository.getUploadedFileInfo(upload);
        // Read the data into memory in a Buffer and resolve with it.
        return this.disks.getDisk(file.disk).read(file.path);
    }

    /**
     * Create a direct read stream from the upload's disk.
     *
     * @param upload
     */
    public async createReadStream(upload: Upload): Promise<Readable> {
        // Ask the repository for info on where and how the upload file is stored.
        const file = await this.repository.getUploadedFileInfo(upload);
        // Read the data into memory in a Buffer and resolve with it.
        return this.disks.getDisk(file.disk).createReadStream(file.path);
    }

    /**
     * Get a URL from the disk for an upload. Will be null if the disk that the upload is stored on does not support
     * URLs or is not configured for them.
     *
     * @param upload
     */
    public async getUrl(upload: Upload): Promise<string | null> {
        // Ask the repository for info on where and how the upload file is stored.
        const file = await this.repository.getUploadedFileInfo(upload);
        // Read the data into memory in a Buffer and resolve with it.
        return this.disks.getDisk(file.disk).getUrl(file.path);
    }

    /**
     * Get a temporary URL from the disk for an upload. Will be null if the disk that the upload is stored on does not
     * support temporary URLs or is not configured for them.
     *
     * @param upload
     * @param expires The number of seconds the URL should expire at. Default is configured at the disk level.
     * @param fallback Whether or not to fallback to permanent URLs if the disk doesn't support temporary URLs. Defualt
     *      is generally false but is configured at the disk level.
     */
    public async getTemporaryUrl(
        upload: Upload,
        expires?: number,
        fallback?: boolean,
    ): Promise<string | null> {
        // Ask the repository for info on where and how the upload file is stored.
        const file = await this.repository.getUploadedFileInfo(upload);
        // Read the data into memory in a Buffer and resolve with it.
        return this.disks
            .getDisk(file.disk)
            .getTemporaryUrl(file.path, expires, fallback);
    }

    /**
     * Download the file to the local disk as a temporary file for operations that require local data manipuation
     * and which can't handle Buffers.
     *
     * @see Disk.withTempFile
     *
     * @param upload
     * @param execute
     */
    public async withTempFile(
        upload: Upload,
        execute: ((path: string) => Promise<void> | void) | null = null,
    ): Promise<string> {
        // Ask the repository for info on where and how the upload file is stored.
        const uploadedFile = await this.repository.getUploadedFileInfo(upload);
        // Resolve the disk for the file.
        const disk = this.disks.getDisk(uploadedFile.disk);
        // Generate a descriptive postfix for the temp file that isn't too long.
        const postfix = `-${uploadedFile.uploadedAs}`.slice(-50);
        // Delegate to the disk
        return disk.withTempFile(uploadedFile.path, execute, { postfix });
    }
}
