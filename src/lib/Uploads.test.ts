import * as fs from 'fs';
import { promisify } from 'util';
import { DiskDriver, DiskManager } from '@carimus/node-disks';
import { MemoryRepository, MemoryRepositoryUploadIdentifier } from '../support';
import { Uploads } from './Uploads';
import { UploadMeta } from '../types';

const readFileFromLocalFilesystem = promisify(fs.readFile);
const deleteFromLocalFilesystem = promisify(fs.unlink);

const disks = {
    default: 'memory',
    memory: {
        driver: DiskDriver.Memory,
    },
};

function setup(): {
    diskManager: DiskManager;
    repository: MemoryRepository;
    uploads: Uploads<MemoryRepositoryUploadIdentifier>;
} {
    const diskManager = new DiskManager(disks);
    const repository = new MemoryRepository();
    return {
        diskManager,
        repository,
        uploads: new Uploads<MemoryRepositoryUploadIdentifier>({
            disks: diskManager,
            repository,
        }),
    };
}

const files: {
    [key: string]: { uploadedAs: string; data: Buffer; meta: UploadMeta };
} = {
    normal: {
        uploadedAs: 'foo.txt',
        data: Buffer.from('This is a normal text test file.\n', 'utf8'),
        meta: { context: 'test', isFoo: true },
    },
    image: {
        uploadedAs: 'black-1x1.png',
        data: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
        ),
        meta: { context: 'test', isFoo: false, isImage: true },
    },
    weirdName: {
        uploadedAs: '.~my~cool~data~&^%$*(¶•ª•.csv',
        data: Buffer.from('a,b,c\nfoo,bar,baz\n1,2,3\n', 'utf8'),
        meta: { context: 'test', isFoo: false, isImage: false },
    },
    longName: {
        uploadedAs:
            '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.csv',
        data: Buffer.from('a,b,c\nfoo,bar,baz\n1,2,3\n', 'utf8'),
        meta: {
            context: 'test',
            isFoo: false,
            isImage: false,
            isSuperLong: true,
        },
    },
};

test('Uploads service can upload and persist to repository.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload all the files
    const normalUpload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const imageUpload = await uploads.upload(
        files.image.data,
        files.image.uploadedAs,
        files.image.meta,
    );
    const weirdNameUpload = await uploads.upload(
        files.weirdName.data,
        files.weirdName.uploadedAs,
        files.weirdName.meta,
    );

    // Check the repository for the file data
    const normalFileInfo = await repository.getUploadedFileInfo(normalUpload);
    const imageFileInfo = await repository.getUploadedFileInfo(imageUpload);
    const weirdNameFileInfo = await repository.getUploadedFileInfo(
        weirdNameUpload,
    );
    expect(normalFileInfo).toBeTruthy();
    expect(typeof normalFileInfo).toBe('object');
    expect(imageFileInfo).toBeTruthy();
    expect(typeof imageFileInfo).toBe('object');
    expect(weirdNameFileInfo).toBeTruthy();
    expect(typeof weirdNameFileInfo).toBe('object');

    // Check the disk for disk data
    const normalDiskData = await diskManager
        .getDisk(normalFileInfo.disk)
        .read(normalFileInfo.path);
    const imageDiskData = await diskManager
        .getDisk(imageFileInfo.disk)
        .read(imageFileInfo.path);
    const weirdNameDiskData = await diskManager
        .getDisk(weirdNameFileInfo.disk)
        .read(weirdNameFileInfo.path);
    expect(normalDiskData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );
    expect(imageDiskData.toString('base64')).toBe(
        files.image.data.toString('base64'),
    );
    expect(weirdNameDiskData.toString('base64')).toBe(
        files.weirdName.data.toString('base64'),
    );
});

test('Uploads service can duplicate an upload, creating a new repository record for it.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file and then duplicate it with new metadata (and also with no new meta)
    const original = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const duplicateMeta = { ...files.normal.meta, isDup: true };
    const duplicate = await uploads.duplicate(original, duplicateMeta);
    const duplicateOldMeta = await uploads.duplicate(original);

    // Check the repository for the original file data and the new file data
    const originalFileRecord = await repository.find(original);
    const duplicateFileRecord = await repository.find(duplicate);
    const duplicateOldMetaFileRecord = await repository.find(duplicateOldMeta);
    expect(originalFileRecord.meta).toMatchObject(files.normal.meta);
    expect(duplicateFileRecord.meta).toMatchObject(duplicateMeta);
    expect(originalFileRecord).not.toMatchObject(duplicateFileRecord);
    expect(duplicateOldMetaFileRecord.meta).toMatchObject(files.normal.meta);

    // Check the disk for the original file and the new file
    const originalFileInfo = await repository.getUploadedFileInfo(original);
    const duplicateFileInfo = await repository.getUploadedFileInfo(duplicate);
    const originalFileData = await diskManager
        .getDisk(originalFileInfo.disk)
        .read(originalFileInfo.path);
    const duplicateFileData = await diskManager
        .getDisk(duplicateFileInfo.disk)
        .read(duplicateFileInfo.path);
    expect(originalFileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );
    expect(duplicateFileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );
});

test('Uploads service can update, updating existing repository records and deleting old files.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file and check to ensure it was created on the disk
    const original = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const originalFileInfo = await repository.getUploadedFileInfo(original);
    await expect(
        diskManager.getDisk(originalFileInfo.disk).read(originalFileInfo.path),
    ).resolves.toBeTruthy();

    // Update the file, get its new info, ensure the new file exists and that the old one was deleted.
    const updatedNewMeta = await uploads.update(
        original,
        files.image.data,
        files.image.uploadedAs,
        files.image.meta,
    );
    const updatedNewMetaFileInfo = await repository.getUploadedFileInfo(
        updatedNewMeta,
    );
    expect(original).toBe(updatedNewMeta);
    await expect(
        diskManager.getDisk(originalFileInfo.disk).read(originalFileInfo.path),
    ).rejects.toBeTruthy();
    await expect(
        diskManager
            .getDisk(updatedNewMetaFileInfo.disk)
            .read(updatedNewMetaFileInfo.path),
    ).resolves.toBeTruthy();
    expect(await repository.getMeta(updatedNewMeta)).toMatchObject(
        files.image.meta,
    );

    // Let's also ensure that meta is preserved if we don't pass any new meta
    const updatedOldMeta = await uploads.update(
        updatedNewMeta,
        files.weirdName.data,
        files.weirdName.uploadedAs,
    );
    const updatedOldMetaFileInfo = await repository.getUploadedFileInfo(
        updatedOldMeta,
    );
    await expect(
        diskManager.getDisk(originalFileInfo.disk).read(originalFileInfo.path),
    ).rejects.toBeTruthy();
    await expect(
        diskManager
            .getDisk(updatedNewMetaFileInfo.disk)
            .read(updatedNewMetaFileInfo.path),
    ).rejects.toBeTruthy();
    await expect(
        diskManager
            .getDisk(updatedOldMetaFileInfo.disk)
            .read(updatedOldMetaFileInfo.path),
    ).resolves.toBeTruthy();
    expect(await repository.getMeta(updatedOldMeta)).toMatchObject(
        files.image.meta,
    );
});

test('Uploads service can delete', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file and check to ensure it was created on the disk
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);
    await expect(repository.getMeta(upload)).resolves.toBeTruthy();
    await expect(
        diskManager.getDisk(fileInfo.disk).read(fileInfo.path),
    ).resolves.toBeTruthy();

    // Delete the upload and ensure it was deleted both from the disk and the repository.
    await uploads.delete(upload);
    await expect(repository.getUploadedFileInfo(upload)).rejects.toBeTruthy();
    await expect(repository.getMeta(upload)).rejects.toBeTruthy();
    await expect(
        diskManager.getDisk(fileInfo.disk).read(fileInfo.path),
    ).rejects.toBeTruthy();
});

test('Uploads service can delete only the file', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file and check to ensure it was created on the disk
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);
    await expect(repository.getMeta(upload)).resolves.toBeTruthy();
    await expect(
        diskManager.getDisk(fileInfo.disk).read(fileInfo.path),
    ).resolves.toBeTruthy();

    // Delete the upload and ensure it was deleted from the disk but **NOT** the repository
    await uploads.delete(upload, true);
    await expect(repository.getUploadedFileInfo(upload)).resolves.toBeTruthy();
    await expect(repository.getMeta(upload)).resolves.toBeTruthy();
    await expect(
        diskManager.getDisk(fileInfo.disk).read(fileInfo.path),
    ).rejects.toBeTruthy();
});

test('Uploads service can create temp files for local manipulation from uploads', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file
    const upload = await uploads.upload(
        files.longName.data,
        files.longName.uploadedAs,
        files.longName.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);
    const uploadedFileData = await diskManager
        .getDisk(fileInfo.disk)
        .read(fileInfo.path);

    // Get the temp file for it and check to make sure their contents match
    const tempPath = await uploads.withTempFile(
        upload,
        async (path: string) => {
            const tempFileData = await readFileFromLocalFilesystem(path);
            expect(tempFileData.toString('base64')).toBe(
                uploadedFileData.toString('base64'),
            );
        },
    );

    // Ensure that once the callback is completed, the file doesn't exist since we didn't tell it not to cleanup
    expect(tempPath).toBeTruthy();
    await expect(readFileFromLocalFilesystem(tempPath)).rejects.toBeTruthy();

    // Do the same stuff again but using the bypass cleanup approach to take cleanup into our own hands
    const persistentTempPath = await uploads.withTempFile(upload);
    expect(persistentTempPath).toBeTruthy();
    const persistentTempFileData = await readFileFromLocalFilesystem(
        persistentTempPath,
    );
    expect(persistentTempFileData.toString('base64')).toBe(
        uploadedFileData.toString('base64'),
    );
    // Note that we use `.resolves.toBeUndefined()` to verify the file is deleted (unlink resolves with void/undefined)
    expect(
        deleteFromLocalFilesystem(persistentTempPath),
    ).resolves.toBeUndefined();
});
