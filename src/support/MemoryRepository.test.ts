import { UploadedFile, UploadMeta } from '../types';
import { MemoryRepository } from './MemoryRepository';

const foo: { file: UploadedFile; meta: UploadMeta } = {
    file: {
        disk: 'default',
        path: '/test/1234-foo.txt',
        uploadedAs: 'foo.txt',
    },
    meta: {
        context: 'tests',
        isFoo: true,
    },
};

const bar: { file: UploadedFile; meta: UploadMeta } = {
    file: {
        disk: 'default',
        path: '/test/4567-foo.txt',
        uploadedAs: 'foo.txt',
    },
    meta: {
        context: 'tests',
        isBar: true,
    },
};

test('MemoryRepository implements create, update, delete, and getUploadedFileInfo', async () => {
    const repo = new MemoryRepository();
    const uploadId = await repo.create(foo.file, foo.meta);
    expect(await repo.getUploadedFileInfo(uploadId)).toMatchObject(foo.file);
    const updatedUploadId = await repo.update(uploadId, bar.file, bar.meta);
    // Note that we expect `Upload`s to be long-lived identifiers (or contain such) so we test that here by
    // checking to ensure the file info is updated for our old upload reference too.
    expect(await repo.getUploadedFileInfo(uploadId)).toMatchObject(bar.file);
    expect(await repo.getUploadedFileInfo(updatedUploadId)).toMatchObject(
        bar.file,
    );
    // `delete` on success resolves with undefined.
    expect(repo.delete(uploadId)).resolves.toBeUndefined();
    // Since upload identifiers should be long-lived identifiers, this should reject since it's already been deleted.
    expect(repo.delete(updatedUploadId)).rejects.toBeTruthy();
});

test('MemoryRepository update handles optional meta by persisting old meta', async () => {
    const repo = new MemoryRepository();
    const fooUploadId = await repo.create(foo.file, foo.meta);
    expect(await repo.getUploadedFileInfo(fooUploadId)).toMatchObject(foo.file);
    expect(await repo.getMeta(fooUploadId)).toMatchObject(foo.meta);
    await repo.update(fooUploadId, bar.file);
    expect(await repo.getUploadedFileInfo(fooUploadId)).toMatchObject(bar.file);
    expect(await repo.getMeta(fooUploadId)).toMatchObject(foo.meta);
});
