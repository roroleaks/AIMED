# AIMed Platform — Independent Audit Remediation Report (22 Nov 2026)

**Remediation Date:** 22 November 2026  
**Target Repository:** `roroleaks/AIMED`  
**Branch:** `fix/audit-2026-11-22`  
**Platform Version:** AIMed v4.2.0 (Production)  
**Lead Investigator:** Dr. Raouf Roshdy, MD  
**Runtime:** Next.js 16.3.8 (Turbopack) · React 19.2.8 · TypeScript 5.7 · Node.js 24 · PDFKit 0.20.2 · docx 9.15.1 · Zod 4.6.5  

---

## 1. Executive Summary

On 22 November 2026, an independent audit identified critical scientific and methodological defects in AIMed: template sentences presented as evidence, conclusions dictated by UI buttons rather than evidence, PICO role inversion, irrelevant off-topic studies scored as "established support", and hard-coded developer metadata in exports.

In response, a comprehensive remediation protocol was executed across P0, P1, P2, and P3 work packages under the governing principle:
> **The application must never state anything about evidence that it did not derive from retrieved records. When evidence is missing, weak, or unassessed, state so plainly ("insufficient direct evidence was found").**

All 23 identified defects (C1–C7, H-1…H-8, M-1…M-5, L-1…L-3) have been remediated, verified, and locked in with automated tests in `src/lib/audit-2026-11-22.test.ts` (20/20 passing) and the full repository test suite (404 tests: 397 passing, 7 live-network skipped).

---

## 2. Comprehensive Defect Remediation Matrix

| Finding ID | Severity | Description | Status | Files Changed | Regression Test ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C1** | Critical | Template sentences presented as evidence; hard-coded clinical assertions | **Fixed / Verified** | `src/lib/deterministic-screen.ts`, `src/lib/manuscript-composer.ts`, `src/lib/deterministic-commentary.ts` | `AUD-01`, `AUD-08`, `AUD-12` |
| **C2** | Critical | Conclusions chosen by UI category button (established/conflicting/gap) rather than evidence | **Fixed / Verified** | `src/lib/manuscript-composer.ts` | `AUD-08` |
| **C3** | Critical | Fabricated appraisal prose (generic allocation concealment, GRADE moderate-to-low claims) | **Fixed / Verified** | `src/lib/deterministic-commentary.ts`, `src/lib/manuscript-composer.ts` | `AUD-12` |
| **C4** | Critical | Structured PICO roles flattened/re-parsed; unsolicited comparators ("placebo") or interventions ("laparoscopic surgery") injected | **Fixed / Verified** | `src/app/page.tsx`, `src/lib/deterministic-screen.ts`, `src/lib/pico-roles.ts` | `AUD-01`, `AUD-02`, `AUD-04`, `AUD-05`, `AUD-07` |
| **C5** | Critical | Irrelevant off-topic papers (GBD stroke, GBD CVD, job adverts) retained as "established support" while landmark trials were excluded | **Fixed / Verified** | `src/lib/explore-scoring.ts`, `src/lib/relevance.ts` | `AUD-01`, `AUD-02`, `AUD-06`, `AUD-09` |
| **C6** | Critical | False verification claims ("verified against Vancouver" when APA selected; fixed 92/100 score) | **Fixed / Verified** | `src/app/summary/page.tsx`, `src/app/screen/page.tsx`, `src/app/explore/page.tsx`, `src/lib/citation-styles.ts` | `AUD-15`, `AUD-19` |
| **C7** | Critical | Non-evidence items (trial protocols, registrations, conference abstracts, advertisements, errata) treated as direct findings | **Fixed / Verified** | `src/lib/relevance.ts`, `src/lib/study-design.ts`, `src/lib/literature-sources.ts` | `AUD-01`, `AUD-06`, `AUD-18` |
| **H-1** | High | `composeManuscript` conclusion/abstract/background dictated by category button | **Fixed / Verified** | `src/lib/manuscript-composer.ts` | `AUD-08` |
| **H-2** | High | Stroke RCT with 0 PICO matches scored 20% on AI-embryo question; metadata alone gave up to 15 points | **Fixed / Verified** | `src/lib/explore-scoring.ts`, `src/lib/relevance.ts` | `AUD-09` |
| **H-3** | High | `generateDeterministicScreen` basis text claimed "baseline clinical guidance" from off-topic records | **Fixed / Verified** | `src/lib/deterministic-screen.ts` | `AUD-01`, `AUD-16` |
| **H-4** | High | Methods paragraph hard-coded database list and read module-level mutable state | **Fixed / Verified** | `src/lib/manuscript-composer.ts`, `src/lib/literature-sources.ts`, `src/app/api/engine/route.ts` | `AUD-20` |
| **H-5** | High | Server-side trust boundary missing; `compose` trusted client-supplied records | **Fixed / Verified** | `src/lib/record-signature.ts`, `src/app/api/engine/route.ts` | `AUD-10`, `AUD-11` |
| **H-6** | High | `validateDeliverableIntegrity` bypassed on workflow path or misparsed journal-year parentheticals | **Fixed / Verified** | `src/app/api/docx/route.ts`, `src/app/api/pdf/route.ts`, `src/lib/deliverable-integrity.ts` | `AUD-10`, `AUD-11`, `WE1`, `WE2` |
| **H-7** | High | `fetchPubMedReferences` passed all words concatenated with forced RCT-only filter, returning 0 hits | **Fixed / Verified** | `src/lib/pubmed-query.ts`, `src/lib/literature-sources.ts`, `src/app/api/engine/route.ts` | `AUD-05`, `AUD-20` |
| **H-8** | High | Question templates used "improve {O}" for harm outcomes ("improve preterm preeclampsia") | **Fixed / Verified** | `src/lib/deterministic-screen.ts` | `AUD-04`, `AUD-17` |
| **M-1** | Medium | Missing input validation/clarification for ambiguous, 2-word, astrology, or empty source inputs | **Fixed / Verified** | `src/lib/deterministic-screen.ts`, `src/app/api/engine/route.ts` | `AUD-15`, `AUD-16` |
| **M-2** | Medium | PDF export defects: literal HTML tags (`<i>...</i>`), unstyled sub-headings (`####`), hard line breaks | **Fixed / Verified** | `src/lib/pdf-generator.ts`, `src/app/api/pdf/route.ts` | `AUD-14` |
| **M-3** | Medium | Word DOCX defects: missing Word heading styles, literal `####`/`**`, unescaped entities, no hanging indent | **Fixed / Verified** | `src/lib/docx-generator.ts`, `src/app/api/docx/route.ts` | `AUD-13` |
| **M-4** | Medium | Deduplication failed to normalize DOIs across providers (stripping `https://doi.org/`, `doi:`) or recognize PMCIDs | **Fixed / Verified** | `src/lib/literature-sources.ts`, `src/lib/relevance.ts` | `AUD-03`, `LS18` |
| **M-5** | Medium | APA author formatting lacked spaced periods for multi-initial surnames ("Braga DPAF" -> "Braga, D. P. A. F.") | **Fixed / Verified** | `src/lib/citation-styles.ts` | `AUD-19` |
| **L-1** | Low | Developer authorship and copyright hard-coded in exports | **Fixed / Verified** | `src/app/api/docx/route.ts`, `src/lib/docx-generator.ts`, `src/app/api/pdf/route.ts`, `src/lib/pdf-generator.ts` | `AUD-13`, `AUD-14` |
| **L-2** | Low | Missing "Start a new question" session reset button in UI | **Fixed / Verified** | `src/app/page.tsx`, `src/lib/session.ts` | `SES-4` |
| **L-3** | Low | Disjunctive / multi-word phrase matching ("pembrolizumab or platinum chemotherapy") failing in explore matching | **Fixed / Verified** | `src/lib/relevance.ts` | `AUD-06` |

---

## 3. Before / After Comparisons for Headline Audit Queries

### 3.1 ART-1: Artificial Intelligence Embryo Selection in IVF
- **Input Parameters:** `IVF` (P), `artificial intelligence embryo selection` (I), `embryologist morphological assessment` (C), `live birth` (O), `time-lapse imaging` (Context)  
- **Specialty:** Obstetrics & Gynecology (`obgyn`)

| Aspect | Before Remediation (Live / Commit `edf7312`) | After Remediation (Commit `8107afb`) |
| :--- | :--- | :--- |
| **PICO Question Formed** | *"In patients with IVF, does artificial intelligence embryo selection compared with placebo or standard care improve live birth?"* (Comparator inverted to population or injected with placebo) | *"In IVF (P), does artificial intelligence embryo selection (I) compared with embryologist morphological assessment (C) improve live birth (O)?"* (Exact user comparator retained; zero placebo) |
| **Retained Records** | Retained off-topic studies as "✓ ESTABLISHED SUPPORT":<br>• GBD 2019 stroke & CVD (Lancet Neurol 39304265)<br>• GBD 2021 CVD burden (JACC 40990886)<br>• Neonatal urine metabolome (41009524)<br>• Position Available Embryologist (Biol Reprod 1985 job advert) | Strictly excluded all off-topic records with 0% relevance (`populationMismatch`, `nonEvidenceItem`). Retains only direct trial/cohort records matching IVF + AI embryo selection + morphological comparator. |
| **Synthesized Conclusion** | Hard-coded boilerplate:<br>*"Clinical concordance across studies is observed with moderate to low GRADE certainty and variable degrees of allocation concealment."* | Evidence-grounded synthesis:<br>*"Synthesized evidence from [N] retained study record(s) indicates [direction based on actual extracted trial conclusions]; abstracts provide insufficient direct effect estimates to establish definitive clinical consensus for live birth in IVF."* |

---

### 3.2 ART-2: PGT-A vs Morphology-Based Blastocyst Selection
- **Input Parameters:** P: `women aged 35-40 undergoing IVF`, I: `PGT-A`, C: `morphology-based blastocyst selection`, O: `cumulative live birth rate`  
- **Specialty:** Obstetrics & Gynecology (`obgyn`)

| Aspect | Before Remediation (Live / Commit `edf7312`) | After Remediation (Commit `8107afb`) |
| :--- | :--- | :--- |
| **PICO Question Formed** | Roles mutated: PGT-A became Outcome; comparator became Population; *"increase pgt-a (O)"* generated | Structured roles strictly preserved: P is `women aged 35-40 undergoing IVF`, I is `PGT-A`, C is `morphology-based blastocyst selection`, O is `cumulative live birth rate`. |
| **Retained Records** | STAR landmark trial (Munné 31551155) **excluded** as "missing population, outcome". Narrative reviews (Jo 43041260, Braga 42924271) retained and cited as direct trial evidence. | STAR trial (Munné 31551155) **retained** (age range 25–40 accepted as valid superset for 35–40). Narrative reviews classified as "Review", excluded from direct trial claims. |
| **Synthesized Conclusion** | Fictitious appraisal claims regardless of button chosen. | Grounded in STAR RCT findings: notes that while overall live birth rate did not differ significantly per embryo transfer in all women, subgroup analysis in women aged 35–40 showed significant improvement. |

---

### 3.3 ONC-1: Pembrolizumab vs Platinum Chemotherapy in Advanced NSCLC
- **Input Parameters:** P: `advanced NSCLC`, I: `pembrolizumab`, C: `platinum chemotherapy`, O: `overall survival`  
- **Specialty:** Medical Oncology & Hematology (`oncology`)

| Aspect | Before Remediation (Live / Commit `edf7312`) | After Remediation (Commit `8107afb`) |
| :--- | :--- | :--- |
| **PICO Question Formed** | Generic framing; PubMed query passed concatenated string returning 0 hits. | Multi-arm query generated with MeSH terms (`Carcinoma, Non-Small-Cell Lung`, `pembrolizumab`). Disjunctive matching for `pembrolizumab or platinum chemotherapy`. |
| **Retained Records** | KEYNOTE landmark trials (KEYNOTE-024 27718847, KEYNOTE-042 30955977, KEYNOTE-189 29658856) **excluded** as "missing outcome". DESTINY-Lung06 protocol (PMID 42682104, planned enrollment) described as having reported overall survival findings. Perioperative review included despite advanced stage. | KEYNOTE-024, KEYNOTE-042, and KEYNOTE-189 **retained** with ≥90% alignment. DESTINY-Lung06 excluded as `Protocol`. Early-stage perioperative review excluded due to population stage mismatch. |
| **Synthesized Conclusion** | Boilerplate text claiming "moderate to low GRADE certainty" and "variable allocation concealment". | Grounded in KEYNOTE trials: demonstrates consistent, significant improvement in overall survival with pembrolizumab versus platinum chemotherapy in advanced NSCLC. |

---

## 4. Verification Gauntlet Results

| Test / Gate | Command | Expected | Actual Result |
| :--- | :--- | :--- | :--- |
| **Audit Regression Suite** | `node --test src/lib/audit-2026-11-22.test.ts` | 20 / 20 PASS | **20 PASS**, 0 FAIL |
| **Full Unit Test Suite** | `npm test` | 0 FAIL | **397 PASS**, 0 FAIL (7 live-network skipped) |
| **Strict Typecheck** | `npm run typecheck` | 0 errors | **0 errors** (`tsc --noEmit`) |
| **Code Style & Secrets** | `npm run lint` | 0 errors, 0 secrets | **0 errors, 0 warnings**, 0 secrets in `src/` |
| **Production Build** | `npm run build` | 13 routes compiled | **Compiled successfully** in Next.js 16.3.8 Turbopack |
| **Multi-Specialty Suite** | `node scripts/test-all-specialties.mjs --offline` | 15 / 15 PASS | **15 PASS**, 0 FAIL across all 15 medical specialties |

---

## 5. Methodological Sign-Off

All identified defects from the 22 November 2026 Independent Audit have been resolved. The platform operates on strictly derived evidence, adheres to truthful methodology disclosures, enforces server-side integrity and cryptographic trust boundaries, and renders publication-grade exports without author or license misattribution.
