# Demo document store

This folder is a local copy of Patchbay's `documents/` tree. Each file sits at the relative path stored on `label.contracts.source_path`, for example `imani-ledger/base/FBR-C-00506_imani-ledger.pdf`. The path has no host, bucket, or URL. This app adds the prefix when it serves the file.

Import the folder after Patchbay has copied the PDFs:

```bash
npm run import-documents
```

The PDF files are gitignored. Commit this note, not the contracts.

## What the UI does

Clicking a node opens the contract panel. When `source_path` is set, the panel loads the PDF from `GET /api/documents/<source_path>`. That route only reads a `.pdf` under this folder. It refuses `..` and anything that is not the stored relative key.

`doc_path` is a different column. Backline's embed job uses it as the ingest identity. The viewer uses `source_path`.

## Production

Do not deploy this folder or this route on a public host. The demo has no authentication, and a Next.js server is a poor place to keep the label's contracts.

Keep the PDFs in a private object store. Amazon S3 is the usual choice; any store with private objects and short-lived URLs works the same way. Use `source_path` as the object key, unchanged. Replace `/api/documents` with a signed URL minted for that key, and keep the bucket private. The GraphQL field stays a relative path so the viewer does not need to know which store is behind it.
