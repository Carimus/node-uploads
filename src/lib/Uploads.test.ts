import * as fs from 'fs';
import { promisify } from 'util';
import {
    DiskDriver,
    DiskManager,
    DiskManagerConfig,
    streamToBuffer,
} from '@carimus/node-disks';
import { MemoryRepository, MemoryRepositoryRecord } from '../support';
import { Uploads } from './Uploads';
import { UploadMeta } from '../types';

const readFileFromLocalFilesystem = promisify(fs.readFile);
const deleteFromLocalFilesystem = promisify(fs.unlink);

const disks: DiskManagerConfig = {
    default: 'memory',
    memory: {
        driver: DiskDriver.Memory,
    },
    nonDefaultMemory: {
        driver: DiskDriver.Memory,
    },
    memoryWithUrls: {
        driver: DiskDriver.Memory,
        config: {
            url: 'http://localhost',
            temporaryUrlFallback: true,
        },
    },
};

function setup(
    extra = {},
): {
    diskManager: DiskManager;
    repository: MemoryRepository;
    uploads: Uploads<MemoryRepositoryRecord>;
} {
    const diskManager = new DiskManager(disks);
    const repository = new MemoryRepository();
    return {
        diskManager,
        repository,
        uploads: new Uploads<MemoryRepositoryRecord>({
            defaultDisk: 'default',
            disks: diskManager,
            repository,
            ...extra,
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
    expect(original.id).toBe(updatedNewMeta.id);
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

test('Uploads service can transfer an upload from non-default disk to default one.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Intentionally upload a file to the non-default disk
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
        'nonDefaultMemory',
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);

    // Ensure it was actually uploaded to the non-default disk we were expecting.
    expect(diskManager.getDisk('nonDefaultMemory').getName()).toBe(
        fileInfo.disk,
    );
    const fileData = await diskManager
        .getDisk('nonDefaultMemory')
        .read(fileInfo.path);
    expect(fileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );

    // Initiate the transfer to the default disk
    await uploads.transfer(upload);

    // Check that it moved disks and that the path stayed the same (the default behaviour)
    const newFileInfo = await repository.getUploadedFileInfo(upload);
    expect(newFileInfo.disk).not.toBe(fileInfo.disk);
    expect(newFileInfo.path).toBe(fileInfo.path);

    // Ensure the file is actually on the new disk
    const newFileData = await diskManager
        .getDisk(newFileInfo.disk)
        .read(newFileInfo.path);
    expect(newFileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );
});

test('Uploads service can transfer an upload from default disk to a non-default one.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Intentionally upload a file to the default disk
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);

    // Ensure it was actually uploaded to the default disk we were expecting.
    expect(diskManager.getDisk('default').getName()).toBe(fileInfo.disk);
    const fileData = await diskManager.getDisk('default').read(fileInfo.path);
    expect(fileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );

    // Initiate the transfer to the non-default disk
    await uploads.transfer(upload, 'nonDefaultMemory');

    // Check that it moved disks and that the path stayed the same (the default behaviour)
    const newFileInfo = await repository.getUploadedFileInfo(upload);
    expect(newFileInfo.disk).not.toBe(fileInfo.disk);
    expect(newFileInfo.disk).toBe(
        diskManager.getDisk('nonDefaultMemory').getName(),
    );
    expect(newFileInfo.path).toBe(fileInfo.path);

    // Ensure the file is actually on the new disk
    const newFileData = await diskManager
        .getDisk(newFileInfo.disk)
        .read(newFileInfo.path);
    expect(newFileData.toString('base64')).toBe(
        files.normal.data.toString('base64'),
    );
});

test('Uploads service can transfer and regenerate path.', async () => {
    const { diskManager, repository, uploads } = setup();

    // Intentionally upload a file to the default disk
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);

    // Initiate the transfer to the non-default disk indicating filename should be regenerated
    await uploads.transfer(upload, 'nonDefaultMemory', null, true);

    // Check that it moved disks and that the path changed
    const newFileInfo = await repository.getUploadedFileInfo(upload);
    expect(newFileInfo.disk).not.toBe(fileInfo.disk);
    expect(newFileInfo.disk).toBe(
        diskManager.getDisk('nonDefaultMemory').getName(),
    );
    expect(newFileInfo.path).not.toBe(fileInfo.path);
});

test('Uploads can read and createReadStream for uploads', async () => {
    const { diskManager, repository, uploads } = setup();

    // Upload a file
    const upload = await uploads.upload(
        files.longName.data,
        files.longName.uploadedAs,
        files.longName.meta,
    );

    // Read the data directly off the disk.
    const fileInfo = await repository.getUploadedFileInfo(upload);
    const uploadedFileData = await diskManager
        .getDisk(fileInfo.disk)
        .read(fileInfo.path);

    // Use the uploads service to read the data into memory and then compare with the disk file data.
    const uploadsReadFileData = await uploads.read(upload);
    expect(uploadedFileData.toString('base64')).toBe(
        uploadsReadFileData.toString('base64'),
    );

    // Use the uploads service to read the readable stream into memory and then compare with the disk file data.
    const uploadsReadStreamFileData = await streamToBuffer(
        await uploads.createReadStream(upload),
    );
    expect(uploadedFileData.toString('base64')).toBe(
        uploadsReadStreamFileData.toString('base64'),
    );
});

test('Uploads can generate urls and temp urls for uploads on disks that supports URLs', async () => {
    const { uploads } = setup({ defaultDisk: 'memoryWithUrls' });

    // Upload a file
    const upload = await uploads.upload(
        files.longName.data,
        files.longName.uploadedAs,
        files.longName.meta,
    );

    // Check the URLs generated
    const url = await uploads.getUrl(upload);
    const tempUrl = await uploads.getTemporaryUrl(upload);
    expect(url).toBeTruthy();
    expect(typeof url).toBe('string');
    expect((url as string).indexOf('http://localhost')).toBe(0);
    expect(tempUrl).toBeTruthy();
    expect(typeof tempUrl).toBe('string');
    expect((tempUrl as string).indexOf('http://localhost')).toBe(0);

    // Transfer the upload to a disk that doesn't support URLs
    await uploads.transfer(upload, 'default');

    // Check to ensure the url and tempUrl are null for this upload now.
    expect(await uploads.getUrl(upload)).toBeNull();
    expect(await uploads.getTemporaryUrl(upload)).toBeNull();
});

test('Uploads service can prefix generated storage paths with pathPrefix config option', async () => {
    const { uploads, repository } = setup({ pathPrefix: 'uploads' });

    // Upload a file and grab its info from the repository
    const upload = await uploads.upload(
        files.normal.data,
        files.normal.uploadedAs,
        files.normal.meta,
    );
    const fileInfo = await repository.getUploadedFileInfo(upload);

    // Consider a pass to be any string starting with `/uploads/` and then followed by any non-forward-slash character
    expect(fileInfo.path).toEqual(expect.stringMatching(/^\/uploads\/[^/]/));
});

test("Uploads service pathPrefix config option doesn't care about leading or trailing slashes", async () => {
    const { uploads: uploadsLeading, repository: repositoryLeading } = setup({
        pathPrefix: '/uploads',
    });
    const { uploads: uploadsTrailing, repository: repositoryTrailing } = setup({
        pathPrefix: 'uploads/',
    });
    const { uploads: uploadsBoth, repository: repositoryBoth } = setup({
        pathPrefix: '/uploads/',
    });

    // Upload files and grab their info from their respective repositories.
    const { data, uploadedAs, meta } = files.normal;
    const uploadLeading = await uploadsLeading.upload(data, uploadedAs, meta);
    const uploadTrailing = await uploadsTrailing.upload(data, uploadedAs, meta);
    const uploadBoth = await uploadsBoth.upload(data, uploadedAs, meta);
    const fileInfoLeading = await repositoryLeading.getUploadedFileInfo(
        uploadLeading,
    );
    const fileInfoTrailing = await repositoryTrailing.getUploadedFileInfo(
        uploadTrailing,
    );
    const fileInfoBoth = await repositoryBoth.getUploadedFileInfo(uploadBoth);

    // Consider a pass to be any string starting with `/uploads/` and then followed by any non-forward-slash character
    expect(fileInfoLeading.path).toEqual(
        expect.stringMatching(/^\/uploads\/[^/]/),
    );
    expect(fileInfoTrailing.path).toEqual(
        expect.stringMatching(/^\/uploads\/[^/]/),
    );
    expect(fileInfoBoth.path).toEqual(
        expect.stringMatching(/^\/uploads\/[^/]/),
    );
});
