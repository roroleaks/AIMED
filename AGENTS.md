# AIMed - Next.js 16 Architecture & Agent Guidelines

- `runtime = "nodejs"` is required on `/api/pdf` and `/api/docx` (PDFKit and `docx` both require native `node:fs` / Node stream environments); do not switch these endpoints to Edge runtime.
- `maxDuration = 60` on `/api/engine` is mandatory to accommodate multi-source literature retrieval across all 11 mandatory sources (PubMed, PMC, Europe PMC, Google Scholar, Semantic Scholar, CrossRef, OpenAlex, DOAJ, ClinicalTrials.gov, Cochrane Library CENTRAL/CDSR, and Preprints) and clinical evidence synthesis.
- Turbopack is the default bundler; `npm run build` is the production build command. Strict TypeScript (`tsc --noEmit`) and ESLint checks gate all builds.
- All 11 literature sources are mandatory (`ALL_LITERATURE_SOURCES`); never reintroduce a user-facing source picker. Deduplicate with `articleIdentityKeys` so no paper is repeated across sources or evidence points.
- Source honesty: per-source status must be tracked via `sourceStatusSnapshot()` and returned in API responses; synthesis Methods must truthfully name only actually queried and responsive sources.
