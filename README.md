# Aimed — Multi-Specialty Medical Intelligence Platform

A clinical literature exploration and inquiry structuring platform designed to assist clinicians and researchers **transition from clinical questions to structured PICO formulations, literature exploration, and draft academic commentary skeletons across 15 medical specialties**.

> **Important Clinical Scope & Methodology Notice:**  
> AIMed is an automated research exploration tool generating preliminary draft manuscripts. It **does not** conduct formal systematic reviews, does **not** perform risk-of-bias assessments (such as Cochrane RoB 2 or ROBINS-I), does **not** perform GRADE certainty evaluations, and does **not** provide definitive clinical practice advice or treatment recommendations. The application assists users by formulating structured PICO questions, querying open scholarly literature databases, identifying candidate study records, and synthesizing an academic commentary skeleton derived strictly from retrieved abstracts. Clinicians and investigators must independently verify all citations, full texts, and clinical claims.

---

## 🏥 Supported Medical Specialties & Guidelines

Aimed features a modular specialty configuration architecture (`src/config/specialties.ts` & `src/lib/specialties.ts`) providing dedicated clinical taxonomies, authority practice guidelines, ranked outcomes, and pre-configured PICO presets across **15 core medical disciplines**:

1. **🤰 Obstetrics & Gynecology**
   - *Guidelines:* ACOG · RCOG · FIGO · SMFM
   - *Focus:* Maternal-fetal medicine, preterm birth prevention, cervical length surveillance, preeclampsia prophylaxis, reproductive endocrinology, PCOS, and endometriosis.

2. **🫀 Cardiology & Vascular Medicine**
   - *Guidelines:* AHA · ACC · ESC · HFSA
   - *Focus:* Heart failure with reduced and preserved ejection fraction (HFrEF / HFpEF), SGLT2 inhibitors, non-valvular atrial fibrillation, complex multivessel CAD, and aortic stenosis.

3. **🎗️ Medical Oncology & Hematology**
   - *Guidelines:* NCCN · ASCO · ESMO · SITC
   - *Focus:* Advanced non-small cell lung cancer (NSCLC), HER2+ breast cancer, immune checkpoint inhibitors, antibody-drug conjugates (ADCs), and targeted therapies.

4. **👶 Pediatrics & Neonatal Medicine**
   - *Guidelines:* AAP · ESPGHAN · RCPCH · WHO
   - *Focus:* Neonatal respiratory distress syndrome (RDS), non-invasive high-flow nasal cannula (HFNC), infant bronchiolitis, Kawasaki disease, and pediatric critical care.

5. **🩺 General & Minimally Invasive Surgery**
   - *Guidelines:* ACS · SAGES · EAES · ASCRS
   - *Focus:* Acute appendicitis, laparoscopic vs open appendectomy, acute cholecystitis, laparoscopic inguinal hernia repair (TEP/TAPP), and ERAS perioperative pathways.

6. **🏥 Internal Medicine & Nephrology**
   - *Guidelines:* ACP · KDIGO · EULAR · NICE
   - *Focus:* Chronic kidney disease (CKD), SGLT2 inhibitors and non-steroidal MRAs, sepsis fluid resuscitation (balanced crystalloids vs saline), and multimorbid systemic care.

7. **🧠 Neurology & Stroke Medicine**
   - *Guidelines:* AAN · ESO · AHA/ASA · ILAE
   - *Focus:* Acute ischemic stroke, endovascular mechanical thrombectomy (extended therapeutic window), thrombolytic therapy (tenecteplase vs alteplase), and neurovascular emergencies.

8. **🩸 Endocrinology & Metabolism**
   - *Guidelines:* ADA · Endocrine Society · EASD · AACE
   - *Focus:* Type 2 diabetes with high cardiorenal risk, obesity pharmacotherapy (tirzepatide vs semaglutide), severe osteoporosis (romosozumab vs alendronate), and metabolic health.

9. **🚑 Emergency Medicine & Critical Care**
   - *Guidelines:* ACEP · SCCM · ERC · AHA
   - *Focus:* Out-of-hospital cardiac arrest (targeted temperature management), septic shock early vasopressor initiation, massive trauma hemorrhage (tranexamic acid), and ARDS.

10. **🧩 Psychiatry & Behavioral Health**
    - *Guidelines:* APA · CANMAT · NICE · WFSBP
    - *Focus:* Treatment-resistant depression (esketamine vs atypical antipsychotics), major depressive disorder (repetitive TMS vs pharmacotherapy), bipolar maintenance (lithium), and schizophrenia.

11. **🦴 Orthopedic Surgery & Sports Medicine**
    - *Guidelines:* AAOS · BOA · EFORT · ESSKA
    - *Focus:* End-stage knee osteoarthritis (robotic-assisted vs conventional manual TKA), acute ACL rupture (early surgical reconstruction vs rehabilitation), and displaced femoral neck fractures.

12. **🫁 Pulmonology & Respiratory Medicine**
    - *Guidelines:* ATS · ERS · GOLD · GINA
    - *Focus:* Chronic obstructive pulmonary disease (triple ICS/LABA/LAMA vs dual LABA/LAMA), idiopathic pulmonary fibrosis (nintedanib vs pirfenidone), and severe eosinophilic asthma biologics.

13. **🧪 Gastroenterology & Hepatology**
    - *Guidelines:* AGA · ACG · ECCO · EASL
    - *Focus:* Moderate-to-severe Crohn's disease (IL-23 p19 inhibitors vs anti-TNF), metabolic dysfunction-associated steatohepatitis (MASH / resmetirom), and cirrhotic acute variceal bleeding (early TIPS).

14. **🦠 Infectious Diseases & Antimicrobial Stewardship**
    - *Guidelines:* IDSA · ESCMID · WHO · CDC
    - *Focus:* Recurrent *Clostridioides difficile* infection (fidaxomicin vs vancomycin), MRSA bacteremia combination therapy, carbapenem-resistant Enterobacterales (CRE), and antimicrobial stewardship.

15. **🧴 Dermatology & Cutaneous Biology**
    - *Guidelines:* AAD · EADV · BAD · EDF
    - *Focus:* Moderate-to-severe chronic plaque psoriasis (IL-23 vs IL-17 inhibitors), atopic dermatitis (JAK inhibitors vs dupilumab), and hidradenitis suppurativa targeted biologics.

---

## 🔄 Core Clinical Workflow (v4)

The platform operates through a streamlined 4-step evidence-based pipeline:

```
[Specialty & PICO Words Intake] (Step 1: /)
 └── Clinician selects clinical specialty and enters 3 to 5 clinical terms with P / I / C / O roles
     (drug names never become outcomes, standard care/placebo is always C, typed order and wording kept)
       │
       ▼
[Literature Screening] (Step 2: /screen) — all 11 literature databases queried concurrently
 ├── Formulates 3 distinct PICO inquiry focus categories:
 │   ├── 1 Established Knowledge focus question + evidence basis
 │   ├── 1 Conflicting Evidence focus question + evidence basis
 │   └── 1 Research Gap focus question + evidence basis
 └── Clinician selects 1 clinical focus category to pursue
       │
       ▼
[Evidence Explorer] (Step 3: /explore)
 ├── Multi-source retrieval & deterministic relevance scoring against selected PICO
 ├── Category-specific bonuses, study design classification, and element matching (P, I, C, O)
 ├── Clinician reviews ranked cards, audits findings, and can exclude non-contributory papers
 └── Excluded papers are permanently filtered out with 0-overlap guarantee
       │
       ▼
[Workflow Summary & Narrative Manuscript] (Step 4: /summary)
 ├── Deterministic 5-section narrative manuscript (Background, Search strategy and screening,
 │   Evidence synthesis with truthful findings, Limitations, and Conclusion)
 ├── Dynamic citation style selector: Vancouver (ICMJE/NLM numerical), APA (7th ed.), or Harvard
 ├── Optional AI prose enrichment preserving headings, numbers, and references with hard validation
 └── Publication-grade DOCX and TrueType PDF exports with verified plain-text DOIs and zero hyperlinks
```

---

## 📚 Mandatory Literature Sources (No Choice, No Repeats)

Every search queries **all** of these free scholarly databases concurrently. There is no source picker: the selection is fixed in `src/lib/literature-sources.ts` (`ALL_LITERATURE_SOURCES`), and any `sources` field sent by a client is ignored.

| Source | API | Key |
|---|---|---|
| 🔵 PubMed (MEDLINE) | NCBI E-utilities | optional `NCBI_API_KEY` (higher rate limit) |
| 🟡 PMC (PubMed Central, open-access full text) | Europe PMC REST | none |
| 🇪🇺 Europe PMC (MEDLINE + preprints + Agricola + patents) | Europe PMC REST | none |
| 🎓 Google Scholar | SerpApi `google_scholar` engine | **key-gated (`SERPAPI_API_KEY` required)** (free plan available) |
| 🟠 Semantic Scholar | S2 Graph API | optional `S2_API_KEY` |
| 🟢 OpenAlex | OpenAlex API | optional `OPENALEX_API_KEY` |
| 🟣 CrossRef | Crossref REST | none |
| 🔓 DOAJ (Directory of Open Access Journals) | DOAJ API | none |
| 📋 ClinicalTrials.gov | NIH ClinicalTrials.gov API v2 | none |
| 📚 Cochrane Library | Cochrane Search + Europe PMC CDSR slice | none |
| 📄 Preprints | Europe PMC REST (`SRC:PPR` / medRxiv, bioRxiv) | none |

Google Scholar has no official API and blocks direct scraping, so it is reached via SerpApi. Without `SERPAPI_API_KEY` that one source is noted as unavailable and the other ten still run.

**Recommended for production (all free):** `NCBI_API_KEY` (PubMed allows 10 requests/s instead of 3, and serverless hosts share IPs that hit the 3/s limit), `OPENALEX_API_KEY` (the keyless daily budget is shared per IP and runs out), and `S2_API_KEY`. Each request paces calls per provider, and a provider that is throttling, down or timing out is skipped for 90 s (`isSourceCoolingDown`), so one slow database cannot push a gap map past the 60 s function limit.

**Per-Source Status & Truthful Methods Reporting:** Every search tracks per-source execution via `sourceStatusSnapshot()`. The API responses (`/api/engine` screen and explore stages) include source status reporting attempted status, hits, and response details. Generated narrative manuscripts state truthful Methods lines naming only databases that responded with evidence, explicitly noting any rate-limited, offline, or keyless providers.

**No paper is ever repeated.** Each record gets identity keys (normalized DOI, numeric PMID, provider id, folded title — `articleIdentityKeys`). A paper returned by several databases is listed once, and in the gap map every reference used on one evidence point is excluded from all later points, whichever database returns it again. Multi-source round-robin representation ensures PubMed volume cannot crowd out other databases from bibliographies.

---

## 🎯 The Deterministic Integrity Pipeline

Aimed retains 100% of the deterministic integrity pipeline guarding clinical outputs against AI hallucinations:

| Stage | Module | Guarantee |
|---|---|---|
| **Canonical Identity** | `src/lib/evidence-set.ts` | One record per paper. DOI is canonical key (with full parenthesis preservation for Elsevier/Lancet DOIs); PMID, Crossref, and OpenAlex serve as verified fallbacks. |
| **Claim Filtering** | `src/lib/relevance.ts` | A record is retained as direct support ONLY if it carries a verified DOI or PMID, passes the confidence gate, and deterministically satisfies every required PICO element. Records about a contradicting population subtype (e.g. HFpEF / DELIVER for an HFrEF question, type 1 vs type 2 diabetes, small-cell vs non-small-cell) are rejected (`populationConflict`). Protocols, trial registrations, errata and conference abstracts are never evidence. |
| **Claim Finalization** | `src/lib/claim-finalization.ts` | Every narrative sentence in the generated commentary is audited. Unsupported assertive claims are removed and an explicit uncertainty caveat is added (at most once per section). Paragraphs, sub-headings and bullets are preserved. Disease descriptors such as "reduced ejection fraction" are not mistaken for claims. |
| **Narrative Reconciliation** | `src/lib/relevance.ts` | Fixpoint reconciliation drives in-text numerical citations and the Vancouver reference list into mutual agreement across abstract, introduction, discussion, and conclusion. |
| **Parity Deliverable Gate** | `src/lib/deliverable-integrity.ts` | Refuses PDF, Word, or clipboard exports if the published bibliography disagrees with the retained evidence set or carries orphan/unsupported numeric citations. |
| **Deterministic Commentary** | `src/lib/deterministic-commentary.ts` | Without an AI key the paper is written from the retained abstracts: each study's labelled conclusion is quoted and cited, directions of effect are counted only from conclusions about the selected outcome, and no effect estimate is ever invented. |
| **Deterministic Fallback** | `src/app/api/engine/route.ts` | Automatically heals narrative citations and ensures 100% integrity validation before returning responses. |

---

## 🚀 Getting Started

### 1. Installation

```bash
cd AIMed
npm install
```

### 2. Run Local Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the landing page and specialty selector.

### 3. Run Test Suite & Typecheck

```bash
npm test                              # 404 tests (397 deterministic PASS, 7 live-network SKIPPED unless AIMED_LIVE_NETWORK=1)
npm run lint                          # ESLint + Secret Scan guard (0 errors, 0 warnings)
npm run typecheck                     # tsc --noEmit (strict TypeScript check)
npm run build                         # Production Next.js build (13 routes, 0 errors)
node scripts/test-all-specialties.mjs --offline # End-to-end 15-specialty deterministic suite for CI (< 60s)
node scripts/test-all-specialties.mjs --offline --specialty <id> # Single specialty offline run
node scripts/test-all-specialties.mjs           # Full live-network E2E suite locally before releases (15/15)
```

### 4. Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | Optional AI provider for gap maps and commentary; without one the deterministic engine is used |
| `NCBI_API_KEY` | PubMed rate limit 10/s instead of 3/s (recommended) |
| `OPENALEX_API_KEY`, `S2_API_KEY` | Higher OpenAlex / Semantic Scholar quotas (recommended) |
| `SERPAPI_API_KEY` | Enables the Google Scholar source |
| `AIMED_OFFLINE_LITERATURE=1` | Server-side switch for CI / air-gapped runs: no literature API is called |

### 5. Snapshot Archive

```bash
npm run snapshot                      # zips the project to dist/aimed-snapshot.zip (no node_modules/.next/.git/.env)
AIMED_SNAPSHOT_DIR="C:\path\to\folder" npm run snapshot   # also copy it to another folder
```

Works on Windows (PowerShell) and macOS / Linux (`zip`).

---

## 📤 Publishing to GitHub as a New Repository

To initialize and push Aimed to GitHub:

```bash
cd /path/to/Aimed

# Initialize Git repository and add remote
git remote add origin https://github.com/<your-username>/Aimed.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## 🚀 Vercel Production Deployment

AIMed is deployed on Vercel (`aimed-pico.vercel.app`):
- **Production Branch:** `main` (builds automatically on push or PR merge to `main`).
- **Environment Variables:** Set optional `NCBI_API_KEY`, `OPENALEX_API_KEY`, `S2_API_KEY`, `SERPAPI_API_KEY` in the Vercel Project Settings.
- **Commit Transparency:** `NEXT_PUBLIC_COMMIT_SHA` is injected at build time from `VERCEL_GIT_COMMIT_SHA` (or fallback git short hash) and displayed directly in the UI footer and in document export footers.

To deploy via Vercel CLI:
```bash
vercel --prod
```

---

## 👨‍⚕️ Author & Credits

- **Creator & Lead Investigator:** Dr. Raouf Roshdy
- **Architecture:** Next.js 16 (App Router), React 19, TypeScript, PDFKit, Zod
- **Clinical Informatics:** Deterministic PICO Formulation, Vancouver ICMJE/NLM referencing, Evidence Gap Mapping, and Multi-Specialty Domain Ontology.
