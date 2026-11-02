# AIMed - Next.js 16 Architecture & Agent Guidelines

- `runtime = "nodejs"` is required on `/api/pdf` and `/api/docx` (PDFKit and `docx` both require native `node:fs` / Node stream environments); do not switch these endpoints to Edge runtime.
- `maxDuration = 60` on `/api/engine` is mandatory to accommodate multi-source literature retrieval (PubMed, PMC, Semantic Scholar, CrossRef, OpenAlex) and clinical evidence synthesis.
- Turbopack is the default bundler; `npm run build` is the production build command. Strict TypeScript (`tsc --noEmit`) and ESLint checks gate all builds.
