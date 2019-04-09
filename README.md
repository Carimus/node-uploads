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

TODO

## TODO

-   [ ] Usage docs
-   [ ] Detailed API docs
-   [ ] More tests:
    -   Test errors when bad `defaultGeneratePath` and/or `defaultSanitizeFilename` are provided.
-   [ ] Do URL generation for publicly available disks.
-   [ ] Support temporary URLs (e.g. presigned URLs for S3 buckets) for disks that support it
-   [ ] Support transfer logic for transferring single uploads from one disk to another and in bulk.
-   [ ] Support `getTemporaryFile` to copy an upload file to the local filesystem tmp directory for direct manipulation
-   [ ] Instead of using an `Upload` type that is `any`, we should use generics

## Development

This project is based on the `carimus-node-ts-package-template`. Check out the
[README and docs there](https://bitbucket.org/Carimus/carimus-node-ts-package-template/src/master/README.md)
for more up to date information on the development process and tools available.
