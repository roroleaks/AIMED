# Aimed — Multi-Specialty Medical Intelligence Platform

A comprehensive clinical intelligence and evidence synthesis platform designed to transition clinicians and researchers **from clinical uncertainty to answerable PICO questions, literature gap mapping, and publication-grade Vancouver commentary papers across all major medical specialties**.

Built upon the deterministic evidence integrity architecture of AIPICO and expanded to universal medicine with domain-calibrated taxonomies, international practice guideline authorities, and prompt engineering without specialty bias.

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

## 🔄 Core Clinical Workflow

The platform operates through a rigorous 7-step evidence-based pipeline:

```
[4 to 6 Tag Words]
       │
       ▼
[Stage: Gap Analysis & Mapping]
 ├── 4 Established Knowledge Points
 ├── 4 Conflicting Evidence Points
 ├── 4 Research Gaps
 └── 4 Candidate PICO Questions (P, I, C, O separated)
       │
       ▼
[PICO Selection & Outcome Ranking]
 └── Clinician chooses 1 PICO -> System generates 4 to 6 Domain-Ranked Outcomes
       │
       ▼
[Outcome Choice & Neutral Formulation]
 └── Clinician picks 1 Outcome -> Question formulated with universal population phrasing ("In patients with...")
       │
       ▼
[Stage: Scientific Commentary Generation]
 ├── Structured Title & Abstract (Background, Methods, Results, Discussion)
 ├── Introduction & Thematic Discussion
 ├── Evidence-grounded Conclusion
 └── ICMJE/NLM Vancouver Reference List ([1], [2], [3]...)
       │
       ▼
[Deliverable Parity & Integrity Gate]
 └── Validates 100% citation backing, checks zero orphan/unsupported citations
       │
       ▼
[Dual PDF Export]
 ├── Full Scientific Commentary PDF (publication-grade, formatted blocks)
 └── Vancouver Reference List PDF (verified DOI/PMID audit trail)
```

---

## 🎯 The Deterministic Integrity Pipeline

Aimed retains 100% of the deterministic integrity pipeline guarding clinical outputs against AI hallucinations:

| Stage | Module | Guarantee |
|---|---|---|
| **Canonical Identity** | `src/lib/evidence-set.ts` | One record per paper. DOI is canonical key (with full parenthesis preservation for Elsevier/Lancet DOIs); PMID, Crossref, and OpenAlex serve as verified fallbacks. |
| **Claim Filtering** | `src/lib/relevance.ts` | A record is retained as direct support ONLY if it carries a verified DOI or PMID, passes the confidence gate, and deterministically satisfies every required PICO element. |
| **Claim Finalization** | `src/lib/claim-finalization.ts` | Every narrative sentence in the generated commentary is audited. Unsupported assertive claims are rewritten into explicit uncertainty caveats rather than fabricated findings. |
| **Narrative Reconciliation** | `src/lib/relevance.ts` | Fixpoint reconciliation drives in-text numerical citations and the Vancouver reference list into mutual agreement across abstract, introduction, discussion, and conclusion. |
| **Parity Deliverable Gate** | `src/lib/deliverable-integrity.ts` | Refuses PDF, Word, or clipboard exports if the published bibliography disagrees with the retained evidence set or carries orphan/unsupported numeric citations. |
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
npm test                              # 365 unit tests across deterministic modules & taxonomy
npm run typecheck                     # tsc --noEmit (strict TypeScript check)
npm run build                         # Production Next.js build
node scripts/test-all-specialties.mjs # End-to-end 15-specialty integration test against localhost
```

---

## 📤 Publishing to GitHub as a New Repository

To initialize and push Aimed to GitHub:

```bash
cd C:\Users\raouf.RAOUFDESKTOP\.gemini\antigravity\scratch\AIMed

# Initialize Git repository and add remote
git remote add origin https://github.com/<your-username>/Aimed.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## 👨‍⚕️ Author & Credits

- **Creator & Lead Investigator:** Dr. Raouf Roshdy
- **Architecture:** Next.js 16 (App Router), React 19, TypeScript, PDFKit, Zod
- **Clinical Informatics:** Deterministic PICO Formulation, Vancouver ICMJE/NLM referencing, Evidence Gap Mapping, and Multi-Specialty Domain Ontology.
