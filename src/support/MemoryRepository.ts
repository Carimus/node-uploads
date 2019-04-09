import { UploadedFile, UploadMeta, UploadRepository } from '../types';

export type MemoryRepositoryUploadIdentifier = number;

export interface MemoryRepositoryRecord {
    id: MemoryRepositoryUploadIdentifier;
    file: UploadedFile;
    meta: UploadMeta;
}

export class MemoryRepository
    implements UploadRepository<MemoryRepositoryUploadIdentifier> {
    private database: Map<
        MemoryRepositoryUploadIdentifier,
        MemoryRepositoryRecord
    > = new Map();
    private counter: MemoryRepositoryUploadIdentifier = 0;

    /**
     * Get the next available ID. Mimics auto-increment starting at 1.
     */
    private getNextID(): MemoryRepositoryUploadIdentifier {
        return ++this.counter;
    }

    /**
     * @inheritDoc
     * @param file
     * @param meta
     */
    public async create(
        file: UploadedFile,
        meta?: UploadMeta,
    ): Promise<MemoryRepositoryUploadIdentifier> {
        const id = this.getNextID();
        const upload = { id, file, meta: meta || {} };
        this.database.set(id, upload);
        return upload.id;
    }

    /**
     * Resolve a record or ID to a fresh record straight from the database.
     * @param id
     */
    private resolve(
        id: MemoryRepositoryUploadIdentifier,
    ): MemoryRepositoryRecord {
        if (!id) {
            throw new Error(`Bad identifier: ${id}`);
        }
        const existingUpload = this.database.get(id);
        if (!existingUpload) {
            throw new Error(`No record found with identifier or record: ${id}`);
        }
        return existingUpload;
    }

    /**
     * @inheritDoc
     * @param upload
     * @param file
     * @param meta
     */
    public async update(
        upload: MemoryRepositoryUploadIdentifier,
        file: UploadedFile,
        meta?: UploadMeta,
    ): Promise<MemoryRepositoryUploadIdentifier> {
        const existingUpload = this.resolve(upload);
        const updatedUpload = {
            ...existingUpload,
            file,
            meta: meta || existingUpload.meta || {},
        };
        this.database.set(existingUpload.id, updatedUpload);
        return updatedUpload.id;
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async delete(
        upload: MemoryRepositoryUploadIdentifier,
    ): Promise<void> {
        const { id } = this.resolve(upload);
        this.database.delete(id);
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async getUploadedFileInfo(
        upload: MemoryRepositoryUploadIdentifier,
    ): Promise<UploadedFile> {
        const existingUpload = this.resolve(upload);
        return existingUpload.file;
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async getMeta(
        upload: MemoryRepositoryUploadIdentifier,
    ): Promise<UploadMeta> {
        const existingUpload = this.resolve(upload);
        return existingUpload.meta;
    }

    /**
     *
     * @param upload
     */
    public async find(
        upload: MemoryRepositoryUploadIdentifier,
    ): Promise<MemoryRepositoryRecord> {
        return this.resolve(upload);
    }

    /**
     * Log out the contents of the repository as a table, optionally filtering by ID.
     *
     * @param id
     */
    public log(id?: MemoryRepositoryUploadIdentifier): void {
        const rawEntries: [
            MemoryRepositoryUploadIdentifier,
            MemoryRepositoryRecord | undefined
        ][] = id ? [[id, this.database.get(id)]] : [...this.database.entries()];
        const entries: [
            MemoryRepositoryUploadIdentifier,
            MemoryRepositoryRecord
        ][] = rawEntries.filter(
            (
                entry: [
                    MemoryRepositoryUploadIdentifier,
                    MemoryRepositoryRecord | undefined
                ],
            ) => !!entry[1],
        ) as [MemoryRepositoryUploadIdentifier, MemoryRepositoryRecord][];
        console.table(
            entries.map(([id, record]) => {
                return { id, ...record.file, meta: record.meta };
            }),
            ['id', 'disk', 'uploadedAs', 'path', 'meta'],
        );
    }
}
