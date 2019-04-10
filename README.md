# Node Uploads

A library for accepting uploads, storing them in abstract disks, and referencing them in your database.

## Getting Started

Install the package in your project:

```
yarn add @carimus/node-uploads
```

Or if you're using `npm`:

```
npm install --save @carimus/node-uploads
```

## Usage

To instantiate a new `Uploads` service, the following options are required:

-   `disks`: Either a `DiskManager` instance or a `DiskManagerConfig` object that a `DiskManager` instance can be created from.
    See [`@carimus/node-disks`](https://github.com/Carimus/node-disks) for more information.
-   `repository`: An object or instance that conforms to the `UploadRepository` interface and is used to fetch and persist information
    about the uploads in whatever way is useful/necessary for the application. [Read more below under "Repositories"](#repositories).

The following options can also be provided but are optional:

-   `defaultDisk`: The name of the disk in the `disks` to use as the default/active disk for storing uploads. Defaults to `'default'`.
-   `sanitizeFilename`: A function that generates a disk-friendly filename from the client-provided filename that the upload was uploaded
    as. The sanitized version of the filename is what's persisted as the `uploadedAs` and in the default `generatePath` logic. The default
    logic replaces all characters that don't pass a certain whitelist of characters with `__` (double underscores).
-   `generatePath`: A function that generates a storage path on the disk (not including or considering the `pathPrefix` described below)
    based on the already sanitized `uploadedAs` client-provided filename. See [`defaultGeneratePath`](src/lib/defaults.ts#17) in the
    source to understand the default implementation. **IMPORTANT:** This function should generate unique filenames in the same tick
    given the same `uploadedAs` value. The default implementation uses `process.hrtime()` to do this.
-   `pathPrefix`: The root storage path for uploads on the selected storage disk. This prefix is included in the path stored in
    the database so this value can be changed and will only affect new uploads. If all of the existing uploads are moved into a
    subdirectory of the current storage disk, change the root of the storage disk instead. More complex scenarios will likely
    require creating a new disk to store old uploads vs. new uploads. This option is particularly useful to isolate / namespace your
    uploads from another developer's uploads if you're using the same remote s3 bucket for example.

### Basic Example

This example (written in TypeScript) shows how to use the `Uploads` service with a traditional database model and a Koa
web server to upload uploads.

**Note:** the database model `MyDBUploadModel` implementation isn't covered here but it can be thought of as a traditional database
model with async CRUD methods for interacting with the database.

#### `./uploads.ts`

```typescript
import {
    Uploads,
    UploadRepository,
    UploadedFile,
    UploadMeta,
} from '@carimus/node-uploads';
import { DiskDriver } from '@carimus/node-disks';
import { MyDBUploadModel } from './database';

// We create the uploads service, specifying our database model as our `Upload` generic type.
export const uploads = new Uploads<MyDBUploadModel>({
    // We specify a single disk `foo` using the Local driver and alias it as the default
    disks: {
        default: 'foo',
        foo: {
            driver: DiskDriver.Local,
            root: '/tmp',
        },
    },
    // We specify to store all new uploads in the `uploads` directory in the root of our disk (`/tmp` on the local FS in this case).
    pathPrefix: 'uploads',
    // We specify our repository using a simple object literal but you can also use an ES6 class instance here too.
    repository: {
        async create(
            uploadedFile: UploadedFile,
            meta?: UploadMeta,
        ): Promise<MyDBUploadModel> {
            return MyDBUploadModel.create({
                disk: uploadedFile.disk,
                path: uploadedFile.path,
                uploadedAs: uploadedFile.uploadedAs,
                context: meta.context || '',
            });
        },
        async update(
            upload: MyDBUploadModel,
            newUploadedFile: UploadedFile,
            newMeta?: UploadMeta,
        ): Promise<MyDBUploadModel> {
            await upload.update({
                disk: newUploadedFile.disk,
                path: newUploadedFile.path,
                uploadedAs: newUploadedFile.uploadedAs,
                context: newMeta.context || '',
            });
            return upload;
        },
        async delete(upload: MyDBUploadModel): Promise<void> {
            await upload.delete();
        },
        async getUploadedFileInfo(
            upload: MyDBUploadModel,
        ): Promise<UploadedFile> {
            const { disk, path, uploadedAs } = upload;
            return { disk, path, uploadedAs };
        },
        async getMeta(upload: MyDBUploadModel): Promise<UploadMeta> {
            const { meta } = upload;
            return { meta };
        },
    } as UploadRepository<MyDBUploadModel>,
});
```

#### `./server.ts`

```typescript
import * as fs from 'fs';
import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as koaBody from 'koa-body';
import { uploads } from './uploads';
import { MyDBUploadModel } from './database';

const app = new Koa();
const router = new Router();

router.get('/uploads', async (ctx) => {
    ctx.body = await MyDBUploadModel.all();
});

router.get('/uploads/:uploadId', async (ctx) => {
    const uploadId = parseInt(ctx.params.uploadId);
    ctx.body = await MyDBUploadModel.find(uploadId);
});

router.delete('/uploads/:uploadId', async (ctx) => {
    const uploadId = parseInt(ctx.params.uploadId);
    await uploads.delete(uploadId);
    ctx.body = { deleted: true };
});

router.post('/uploads', koaBody({ multipart: true }), async (ctx) => {
    const { path, name } = ctx.request.files.file;
    ctx.body = await uploads.upload(fs.createReadStream(path), name, {
        context: '*',
    });
});

router.put('/uploads/:uploadId', koaBody({ multipart: true }), async (ctx) => {
    const uploadId = parseInt(ctx.params.uploadId);
    const upload = await MyDBUploadModel.find(uploadId);
    const { path, name } = ctx.request.files.file;
    ctx.body = await uploads.update(upload, fs.createReadStream(path), name, {
        context: '*',
    });
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});
```

## Repositories

In order for the `Uploads` service to be of any real use, you need to provide it with an object that conforms to the `UploadRepository`
interface which it can use to persist data about where an upload is stored and the metadata surrounding the upload.

See the documentation in the [source](./src/types.ts#L40) for more details but in general, the methods that an `UploadRepository` must
implement are:

-   `create(uploadedFile: UploadedFile, meta?: UploadMeta): Promise<Upload> | Upload`
-   `update(upload: Upload, newUploadedFile: UploadedFile, newMeta?: UploadMeta): Promise<Upload> | Upload`
-   `delete(upload: Upload): Promise<void> | void`
-   `getUploadedFileInfo(upload: Upload): Promise<UploadedFile> | UploadedFile`
-   `getMeta(upload: Upload): Promise<UploadMeta> | UploadMeta`

Noting that:

-   The methods can be sync or async
-   `Upload` is a generic type and can be anything used to uniquely identify the upload in your repository. If you're using a database
    it's typically easiest to use the full record as the `Upload` because all of the operations that return an `Upload` will return the
    full record as opposed to using an ID for the `Upload` which will require another database query to get the full info to i.e.
    return the data to the client in a server request/response. That's simply a recommendation though; the developer can use whatever
    they like as an `Upload`.
-   [`UploadedFile`](./src/types.ts#L6) is an object with the shape: `{ disk: string, path: string, uploadedAs: string }`
-   [`UploadMeta`](./src/types.ts#L25) is an object with any or no keys designed to store and pass thru whatever information is
    helpful to pass around and through the uploads service. A string `context` key is recommended for identifying the context
    in which the upload was uploaded or is used.

## TODO

-   [ ] Usage docs
-   [ ] Detailed API docs
-   [ ] Do permanent and temporary (e.g. presigned URLs for S3 buckets) URL generation.

## Development

This project is based on the `carimus-node-ts-package-template`. Check out the
[README and docs there](https://bitbucket.org/Carimus/carimus-node-ts-package-template/src/master/README.md)
for more up to date information on the development process and tools available.
