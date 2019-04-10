import { UploadedFile, UploadMeta, UploadRepository } from '../types';

export interface MemoryRepositoryRecord {
    id: number;
    file: UploadedFile;
    meta: UploadMeta;
}

export class MemoryRepository
    implements UploadRepository<MemoryRepositoryRecord> {
    private database: Map<number, MemoryRepositoryRecord> = new Map();
    private counter: number = 0;

    /**
     * Get the next available ID. Mimics auto-increment starting at 1.
     */
    private getNextID(): number {
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
    ): Promise<MemoryRepositoryRecord> {
        const id = this.getNextID();
        const upload = { id, file, meta: meta || {} };
        this.database.set(id, upload);
        return upload;
    }

    /**
     * Resolve a record or ID to a fresh record straight from the database.
     * @param idOrRecord
     */
    private resolve(
        idOrRecord: number | MemoryRepositoryRecord,
    ): MemoryRepositoryRecord {
        if (!idOrRecord) {
            throw new Error(`Bad identifier: ${idOrRecord}`);
        }
        let id = typeof idOrRecord === 'object' ? idOrRecord.id : idOrRecord;
        const existingUpload = this.database.get(id);
        if (!existingUpload) {
            throw new Error(`No record found with identifier: ${id}`);
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
        upload: MemoryRepositoryRecord,
        file: UploadedFile,
        meta?: UploadMeta,
    ): Promise<MemoryRepositoryRecord> {
        const existingUpload = this.resolve(upload);
        const updatedUpload = {
            ...existingUpload,
            file,
            meta: meta || existingUpload.meta || {},
        };
        this.database.set(existingUpload.id, updatedUpload);
        return updatedUpload;
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async delete(upload: MemoryRepositoryRecord): Promise<void> {
        const { id } = this.resolve(upload);
        this.database.delete(id);
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async getUploadedFileInfo(
        upload: MemoryRepositoryRecord,
    ): Promise<UploadedFile> {
        const existingUpload = this.resolve(upload);
        return existingUpload.file;
    }

    /**
     * @inheritDoc
     * @param upload
     */
    public async getMeta(upload: MemoryRepositoryRecord): Promise<UploadMeta> {
        const existingUpload = this.resolve(upload);
        return existingUpload.meta;
    }

    /**
     *
     * @param upload
     */
    public async find(
        upload: MemoryRepositoryRecord,
    ): Promise<MemoryRepositoryRecord> {
        return this.resolve(upload);
    }

    /**
     * Log out the contents of the repository as a table, optionally filtering by ID.
     *
     * @param id
     */
    public log(id?: number): void {
        const rawEntries: [number, MemoryRepositoryRecord | undefined][] = id
            ? [[id, this.database.get(id)]]
            : [...this.database.entries()];
        const entries: [number, MemoryRepositoryRecord][] = rawEntries.filter(
            (entry: [number, MemoryRepositoryRecord | undefined]) => !!entry[1],
        ) as [number, MemoryRepositoryRecord][];
        console.table(
            entries.map(([id, record]) => {
                return { id, ...record.file, meta: record.meta };
            }),
            ['id', 'disk', 'uploadedAs', 'path', 'meta'],
        );
    }
}
