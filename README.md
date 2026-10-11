# Aimed — Multi-Specialty Medical Intelligence Platform

A comprehensive clinical intelligence and evidence synthesis platform designed to transition clinicians and researchers **from clinical uncertainty to answerable PICO questions, literature gap mapping, and publication-grade Vancouver commentary papers across multiple medical specialties**.

Built upon the deterministic evidence integrity architecture of AIPICO and expanded to support major clinical specialties with domain-calibrated taxonomies, clinical guideline authorities, and prompt engineering.

---

## 🏥 Supported Medical Specialties

Aimed features a modular specialty configuration architecture (`src/config/specialties.ts` & `src/lib/specialties.ts`) providing dedicated clinical taxonomies, practice guidelines, ranked outcomes, and pre-configured PICO presets for:

1. **🤰 Obstetrics & Gynecology (Obs/Gyn)**
   - *Guidelines:* ACOG · RCOG · FIGO · SMFM
   - *Focus:* Maternal-fetal medicine, high-risk obstetrics, preterm birth prevention, reproductive endocrinology, endometriosis, PCOS, and benign gynecology.
2. **🫀 Cardiology & Vascular Medicine**
   - *Guidelines:* AHA · ACC · ESC · HFSA
   - *Focus:* Heart failure (HFrEF/HFpEF), non-valvular atrial fibrillation, complex multivessel CAD, severe aortic stenosis (TAVR vs SAVR), and cardiovascular prevention.
3. **🎗️ Medical Oncology & Hematology**
   - *Guidelines:* NCCN · ASCO · ESMO · SITC
   - *Focus:* Advanced solid tumors (NSCLC, HER2+ breast cancer, ovarian cancer), immune checkpoint inhibitors, antibody-drug conjugates (ADCs), and PARP inhibitors.
4. **👶 Pediatrics & Neonatal Medicine**
   - *Guidelines:* AAP · ESPGHAN · RCPCH · WHO
   - *Focus:* Neonatal respiratory distress syndrome (RDS), infant bronchiolitis, Kawasaki disease, high-flow nasal cannula (HFNC), and pediatric critical care.
5. **🩺 General & Minimally Invasive Surgery**
   - *Guidelines:* ACS · SAGES · EAES · ASCRS
   - *Focus:* Acute appendicitis, acute cholecystitis, inguinal hernia repairs (laparoscopic TEP/TAPP vs open Lichtenstein), and ERAS perioperative protocols.
6. **🏥 Internal Medicine & Nephrology**
   - *Guidelines:* ACP · KDIGO · EULAR · NICE
   - *Focus:* Chronic kidney disease (CKD), diabetic kidney disease, sepsis fluid resuscitation (balanced crystalloids vs saline), and systemic multimorbidities.
7. **🧠 Neurology & Stroke Medicine**
   - *Guidelines:* AAN · ESO · AHA/ASA · ILAE
   - *Focus:* Acute ischemic stroke, endovascular mechanical thrombectomy, thrombolytic therapy (tenecteplase vs alteplase), and neurovascular emergencies.
8. **🩸 Endocrinology & Metabolism**
   - *Guidelines:* ADA · Endocrine Society · EASD · AACE
   - *Focus:* Type 2 diabetes, obesity medicine (tirzepatide vs semaglutide), postmenopausal osteoporosis (romosozumab vs alendronate), and metabolic health.

---

## 🎯 The Integrity Pipeline

Aimed retains 100% of the deterministic integrity pipeline guarding clinical outputs against AI hallucinations:

| Stage | Module | Guarantee |
|---|---|---|
| **Canonical identity** | `src/lib/evidence-set.ts` | One record per paper. DOI is canonical key; PMID, Crossref, and OpenAlex serve as verified fallbacks. |
| **Claim filtering** | `src/lib/relevance.ts` | A record is retained as direct support ONLY if it carries a verified DOI or PMID, passes the confidence gate, and deterministically satisfies every required PICO element. |
| **Claim finalization** | `src/lib/claim-finalization.ts` | Every narrative sentence in the generated commentary is audited. Unsupported assertive claims are rewritten into explicit uncertainty caveats rather than fabricated findings. |
| **Narrative reconciliation** | `src/lib/relevance.ts` | Fixpoint reconciliation drives in-text numerical citations and the Vancouver reference list into mutual agreement across abstract, introduction, discussion, and conclusion. |
| **Parity deliverable gate** | `src/lib/deliverable-integrity.ts` | Refuses PDF, Word, or clipboard exports if the bibliography disagrees with the retained evidence set. |

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
npm test          # 357 tests across deterministic modules & multi-specialty taxonomy
npm run typecheck # tsc --noEmit (strict TypeScript check)
npm run build     # Production Next.js build
```

---

## 📤 Publishing to GitHub as a New Repository

To initialize and push Aimed to GitHub:

```bash
cd C:\Users\raouf.RAOUFDESKTOP\.gemini\antigravity\scratch\AIMed

# Initialize new Git repository
git init -b main

# Add files and create initial commit
git add .
git commit -m "feat: initial commit of Aimed multi-specialty medical intelligence platform"

# Link to your new GitHub repository (create it on GitHub first, e.g., 'Aimed')
git remote add origin https://github.com/<your-username>/Aimed.git

# Push to GitHub
git push -u origin main
```

---

## 👨‍⚕️ Author & Credits

- **Creator & Lead Investigator:** Dr. Raouf Roshdy
- **Architecture:** Next.js 16 (App Router), React 19, TypeScript, PDFKit, Zod
- **Clinical Informatics:** Deterministic PICO Formulation, Vancouver ICMJE/NLM referencing, Evidence Gap Mapping, and Multi-Specialty Domain Ontology.
