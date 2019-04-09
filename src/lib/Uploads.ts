import { Readable } from 'stream';
import { DiskManager } from '@carimus/node-disks';
import { InvalidConfigError, PathNotUniqueError } from '../errors';
import {
    Upload,
    UploadedFile,
    UploadMeta,
    UploadRepository,
    UploadsConfig,
} from '../types';
import { trimPath } from './utils';
import { defaultSanitizeFilename, defaultGeneratePath } from './defaults';

/**
 * A service for handling uploaded files.
 *
 * TODO Do URL generation for publicly available disks.
 * TODO Support temporary URLs (e.g. presigned URLs for S3 buckets) for disks that support it
 * TODO Support transfer logic for transferring single uploads from one disk to another and in bulk.
 * TODO Support `getTemporaryFile` to copy an upload file to the local filesystem tmp directory for direct manipulation
 */
export class Uploads {
    private config: UploadsConfig;
    private repository: UploadRepository;
    private disks: DiskManager;

    public constructor(config: UploadsConfig) {
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
     * @param fileData
     * @param uploadedAs
     */
    public async place(
        fileData: Buffer | Readable,
        uploadedAs: string,
    ): Promise<UploadedFile> {
        // Generate a filename and path.
        const sanitizedUploadedAs = this.sanitizeFilename(uploadedAs);
        const path = this.generateStoragePath(sanitizedUploadedAs);
        // Grab a disk instance and write the data to the disk.
        const diskName = this.getDefaultDiskName();
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
     * Take an uploaded file and copy it to a new unique generated location on the default disk, regardless of the
     * source disk.
     *
     * TODO Once @carimus/node-disks supports the copy operation, use that when oldDisk === newDisk
     *
     * @param originalFile
     */
    public async copy(originalFile: UploadedFile): Promise<UploadedFile> {
        // Resolve the disks
        const newDiskName = this.getDefaultDiskName();
        const newDisk = this.disks.getDisk(newDiskName);
        const originalDisk = this.disks.getDisk(originalFile.disk);

        // Clone the original file upload info, setting the new disk and regenerating the path.
        const newFile: UploadedFile = {
            ...originalFile,
            disk: newDisk.getName() || newDiskName,
            path: this.generateStoragePath(originalFile.uploadedAs),
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
     */
    public async upload(
        fileData: Buffer | Readable,
        uploadedAs: string,
        meta?: UploadMeta,
    ): Promise<Upload> {
        const uploadedFile = await this.place(fileData, uploadedAs);
        return this.repository.create(uploadedFile, meta);
    }

    /**
     * Update an existing upload with a new uploaded file by placing the new file and deleting the old file, updating
     * the upload itself in the repository.
     *
     * @param upload
     * @param fileData
     * @param uploadedAs
     * @param meta
     */
    public async update(
        upload: Upload,
        fileData: Buffer | Readable,
        uploadedAs: string,
        meta?: UploadMeta,
    ): Promise<Upload> {
        // Get the info about the old file and resolve its disk.
        const oldFile = await this.repository.getUploadedFileInfo(upload);
        const oldDisk = this.disks.getDisk(oldFile.disk);

        // Place the new file on the default disk
        const newFile = await this.place(fileData, uploadedAs);

        // Delete the old file from the old disk
        await oldDisk.delete(oldFile.path);

        // Update the upload in the repository with the new file's data.
        return this.repository.update(upload, newFile, meta);
    }

    /**
     * Duplicate an existing upload to the default disk no matter what the current uploads disk is and create it in
     * the repository.
     *
     * This will regenerate the path even if the upload is remaining on the same disk.
     *
     * The original upload will not be touched.
     *
     * @param original
     * @param meta
     */
    public async duplicate(
        original: Upload,
        meta?: UploadMeta,
    ): Promise<Upload> {
        // Ask the repository for info on where and how the original upload file is stored.
        const originalFile = await this.repository.getUploadedFileInfo(
            original,
        );

        // Copy the original file to the new file location.
        const newFile = await this.copy(originalFile);

        // Store the new upload in the repository and return it
        return this.repository.create(
            newFile,
            meta || (await this.repository.getMeta(original)),
        );
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
}
