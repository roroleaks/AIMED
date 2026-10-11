export interface PicoPreset {
  id: string;
  name: string;
  description: string;
  p: string; // Population
  i: string; // Intervention
  c: string; // Comparator
  o: string; // Target Outcome
  raw: string; // Comma-separated query
}

export interface OutcomeRule {
  keywords: string[];
  primary: string;
  alternatives: string[];
  rationale: string;
}

export interface SpecialtyDefinition {
  id: string;
  label: string;
  shortName: string;
  icon: string;
  category: "Women's Health" | "Cardiovascular" | "Oncology" | "Pediatrics" | "Surgery" | "Internal Medicine" | "Neuroscience" | "Metabolic";
  description: string;
  authorityGuidelines: string;
  conditions: string[];
  interventions: string[];
  outcomesRanked: string[];
  terminology: string[];
  presets: PicoPreset[];
  outcomeRules: OutcomeRule[];
  systemPromptRole: string;
  gapPromptRole: string;
}

export const SPECIALTIES: Record<string, SpecialtyDefinition> = {
  obgyn: {
    id: "obgyn",
    label: "Obstetrics & Gynecology",
    shortName: "Obs/Gyn",
    icon: "🤰",
    category: "Women's Health",
    description: "Maternal-fetal medicine, high-risk obstetrics, general gynecology, and reproductive medicine.",
    authorityGuidelines: "ACOG · RCOG · FIGO · SMFM",
    conditions: [
      "short cervix", "preterm birth risk", "preeclampsia", "gestational diabetes mellitus",
      "cervical insufficiency", "fetal growth restriction", "placenta previa", "placenta accreta spectrum",
      "PCOS", "endometriosis", "adenomyosis", "uterine fibroids", "heavy menstrual bleeding",
      "recurrent pregnancy loss", "postpartum hemorrhage"
    ],
    interventions: [
      "vaginal progesterone", "cervical cerclage", "cervical pessary", "low-dose aspirin",
      "magnesium sulfate", "antenatal corticosteroids", "letrozole", "clomiphene citrate",
      "dienogest", "GnRH agonist", "laparoscopic cystectomy", "uterine artery embolization",
      "IVF", "metformin", "nifedipine"
    ],
    outcomesRanked: [
      "spontaneous preterm birth < 34 weeks", "spontaneous preterm birth < 37 weeks",
      "composite neonatal morbidity", "perinatal mortality", "preeclampsia incidence",
      "cumulative live birth rate", "clinical pregnancy rate", "pelvic pain reduction",
      "heavy menstrual bleeding control", "postpartum hemorrhage incidence"
    ],
    terminology: ["ACOG", "RCOG", "SMFM", "FIGO", "PPROM", "GDM", "PPH", "IUGR", "FGR", "LBR"],
    presets: [
      {
        id: "short-cervix",
        name: "Short Cervix (Progesterone vs Cerclage)",
        description: "Asymptomatic singleton pregnancy with transvaginal cervical length ≤ 25 mm",
        p: "asymptomatic singleton pregnancy, short cervix <= 25 mm",
        i: "vaginal progesterone",
        c: "cervical cerclage",
        o: "spontaneous preterm birth < 34 weeks",
        raw: "short cervix, vaginal progesterone, cervical cerclage, preterm birth, cervical length"
      },
      {
        id: "pcos-ovulation",
        name: "PCOS (Letrozole vs Clomiphene)",
        description: "Anovulatory infertility secondary to polycystic ovary syndrome",
        p: "polycystic ovary syndrome, anovulatory infertility",
        i: "letrozole",
        c: "clomiphene citrate",
        o: "cumulative live birth rate",
        raw: "PCOS, letrozole, clomiphene citrate, live birth rate, ovulation induction"
      },
      {
        id: "endometriosis-pain",
        name: "Endometriosis (Laparoscopy vs Dienogest)",
        description: "Symptomatic moderate-to-severe pelvic pain in confirmed endometriosis",
        p: "endometriosis, chronic pelvic pain",
        i: "laparoscopic surgical excision",
        c: "dienogest",
        o: "pelvic pain reduction at 12 months",
        raw: "endometriosis, laparoscopic excision, dienogest, pelvic pain, ovarian reserve"
      },
      {
        id: "preeclampsia-prevention",
        name: "Preeclampsia (Early Low-Dose Aspirin vs Placebo)",
        description: "High-risk nulliparous or prior preeclampsia pregnancies",
        p: "high-risk pregnancy, prior preeclampsia",
        i: "early low-dose aspirin 150 mg",
        c: "placebo",
        o: "preterm preeclampsia < 37 weeks",
        raw: "high-risk pregnancy, aspirin, placebo, preeclampsia, perinatal mortality"
      }
    ],
    outcomeRules: [
      {
        keywords: ["short cervix", "cervical length", "preterm birth"],
        primary: "spontaneous preterm birth < 34 weeks",
        alternatives: ["composite neonatal morbidity", "spontaneous preterm birth < 37 weeks", "perinatal mortality"],
        rationale: "Delivery before 34 weeks drives the overwhelming majority of neonatal respiratory distress, IVH, and ICU admissions."
      },
      {
        keywords: ["pcos", "polycystic", "infertility", "ovulation"],
        primary: "cumulative live birth rate",
        alternatives: ["clinical pregnancy rate", "time to pregnancy", "ovulation rate", "miscarriage rate"],
        rationale: "Live birth remains the ultimate patient-centered benchmark in reproductive medicine, superseding intermediate surrogates."
      },
      {
        keywords: ["preeclampsia", "gestational hypertension"],
        primary: "preterm preeclampsia < 37 weeks",
        alternatives: ["severe maternal morbidity", "fetal growth restriction", "perinatal death"],
        rationale: "Early-onset and preterm preeclampsia carry disproportionate maternal and fetal morbidity."
      }
    ],
    systemPromptRole: "You are an expert physician, maternal-fetal medicine specialist, and academic medical writer specializing in Obstetrics, Gynecology, and Reproductive Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Obstetrics & Gynecology with strict scientific editorial standards."
  },

  cardiology: {
    id: "cardiology",
    label: "Cardiology & Vascular Medicine",
    shortName: "Cardiology",
    icon: "🫀",
    category: "Cardiovascular",
    description: "Heart failure, ischemic heart disease, electrophysiology, arrhythmias, and cardiovascular prevention.",
    authorityGuidelines: "AHA · ACC · ESC · HFSA",
    conditions: [
      "heart failure with reduced ejection fraction (HFrEF)",
      "heart failure with preserved ejection fraction (HFpEF)",
      "non-valvular atrial fibrillation",
      "acute coronary syndrome",
      "stable ischemic heart disease",
      "resistant hypertension",
      "aortic stenosis",
      "hypertrophic cardiomyopathy",
      "hypercholesterolemia",
      "ventricular tachycardia"
    ],
    interventions: [
      "SGLT2 inhibitors (dapagliflozin, empagliflozin)",
      "ARNI (sacubitril/valsartan)",
      "direct oral anticoagulants (DOACs: apixaban, rivaroxaban)",
      "percutaneous coronary intervention (PCI)",
      "coronary artery bypass grafting (CABG)",
      "transcatheter aortic valve implantation (TAVR)",
      "PCSK9 inhibitors",
      "catheter ablation",
      "mineralocorticoid receptor antagonists (finerenone, spironolactone)",
      "GLP-1 receptor agonists"
    ],
    outcomesRanked: [
      "all-cause mortality", "cardiovascular death",
      "heart failure hospitalization", "major adverse cardiovascular events (MACE)",
      "ischemic stroke or systemic embolism", "major bleeding",
      "renal composite endpoint", "quality of life (KCCQ score)"
    ],
    terminology: ["HFrEF", "HFpEF", "MACE", "DOAC", "PCI", "CABG", "TAVR", "LVEF", "NYHA", "KCCQ"],
    presets: [
      {
        id: "hfref-sglt2",
        name: "HFrEF (SGLT2i vs Placebo)",
        description: "Heart failure with reduced ejection fraction on guideline-directed medical therapy",
        p: "heart failure with reduced ejection fraction, NYHA class II-IV",
        i: "SGLT2 inhibitors",
        c: "placebo",
        o: "cardiovascular death or heart failure hospitalization",
        raw: "heart failure reduced ejection fraction, SGLT2 inhibitor, placebo, CV mortality, hospitalization"
      },
      {
        id: "afib-doac-warfarin",
        name: "Atrial Fibrillation (DOACs vs Warfarin)",
        description: "Non-valvular atrial fibrillation with elevated CHA2DS2-VASc stroke score",
        p: "non-valvular atrial fibrillation, elevated thromboembolic risk",
        i: "direct oral anticoagulants (DOACs)",
        c: "warfarin",
        o: "stroke or systemic embolism",
        raw: "atrial fibrillation, DOAC, warfarin, ischemic stroke, major bleeding"
      },
      {
        id: "cad-pci-cabg",
        name: "Multivessel CAD (PCI vs CABG)",
        description: "Complex multivessel coronary artery disease and diabetic patients",
        p: "multivessel coronary artery disease, diabetes mellitus",
        i: "coronary artery bypass grafting (CABG)",
        c: "percutaneous coronary intervention (PCI)",
        o: "major adverse cardiovascular and cerebrovascular events (MACCE)",
        raw: "multivessel coronary artery disease, CABG, PCI, diabetes, all-cause mortality, repeat revascularization"
      },
      {
        id: "aortic-stenosis-tavr",
        name: "Severe Aortic Stenosis (TAVR vs SAVR)",
        description: "Symptomatic severe aortic stenosis in intermediate surgical risk",
        p: "severe symptomatic aortic stenosis, intermediate surgical risk",
        i: "transcatheter aortic valve replacement (TAVR)",
        c: "surgical aortic valve replacement (SAVR)",
        o: "all-cause mortality or disabling stroke at 2 years",
        raw: "severe aortic stenosis, TAVR, surgical valve replacement, all-cause mortality, stroke"
      }
    ],
    outcomeRules: [
      {
        keywords: ["heart failure", "hfref", "hfpef", "ejection fraction"],
        primary: "cardiovascular death or heart failure hospitalization",
        alternatives: ["all-cause mortality", "KCCQ physical limitation score", "renal composite endpoint"],
        rationale: "The composite of CV death and worsening heart failure events is the universally accepted regulatory and clinical standard."
      },
      {
        keywords: ["atrial fibrillation", "afib", "anticoagul"],
        primary: "stroke or systemic embolism",
        alternatives: ["major bleeding (ISTH criteria)", "all-cause mortality", "intracranial hemorrhage"],
        rationale: "Stroke prevention is the primary therapeutic goal of anticoagulation, balanced rigorously against fatal and intracranial hemorrhage."
      },
      {
        keywords: ["coronary", "pci", "cabg", "ischemic heart"],
        primary: "major adverse cardiovascular events (MACE)",
        alternatives: ["all-cause mortality", "myocardial infarction", "repeat revascularization"],
        rationale: "Long-term ischemic protection and survival define revascularization efficacy in complex coronary disease."
      }
    ],
    systemPromptRole: "You are an expert cardiologist, cardiovascular clinical trialist, and academic medical writer specializing in Cardiology and Vascular Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Cardiology & Cardiovascular Medicine with strict scientific editorial standards."
  },

  oncology: {
    id: "oncology",
    label: "Medical Oncology & Hematology",
    shortName: "Oncology",
    icon: "🎗️",
    category: "Oncology",
    description: "Solid tumors, systemic therapies, immune checkpoint inhibitors, and targeted precision oncology.",
    authorityGuidelines: "NCCN · ASCO · ESMO · SITC",
    conditions: [
      "advanced non-small cell lung cancer (NSCLC)",
      "HER2-positive metastatic breast cancer",
      "triple-negative breast cancer (TNBC)",
      "metastatic colorectal cancer (mCRC)",
      "advanced renal cell carcinoma (RCC)",
      "metastatic melanoma",
      "epithelial ovarian cancer",
      "castration-resistant prostate cancer",
      "diffuse large B-cell lymphoma (DLBCL)"
    ],
    interventions: [
      "immune checkpoint inhibitors (pembrolizumab, nivolumab)",
      "antibody-drug conjugates (trastuzumab deruxtecan)",
      "tyrosine kinase inhibitors (osimertinib)",
      "PARP inhibitors (olaparib, niraparib)",
      "CAR T-cell therapy",
      "platinum-based doublet chemotherapy",
      "VEGF inhibitors (bevacizumab)",
      "CDK4/6 inhibitors (palbociclib, ribociclib)",
      "androgen receptor pathway inhibitors"
    ],
    outcomesRanked: [
      "overall survival (OS)",
      "progression-free survival (PFS)",
      "objective response rate (ORR)",
      "duration of response (DoR)",
      "grade 3-4 treatment-related adverse events",
      "health-related quality of life (EORTC QLQ-C30)"
    ],
    terminology: ["NCCN", "ESMO", "ASCO", "RECIST", "OS", "PFS", "ORR", "ADC", "IO", "TKI"],
    presets: [
      {
        id: "nsclc-io-chemo",
        name: "NSCLC (Immunotherapy + Chemo vs Chemo)",
        description: "Treatment-naive advanced non-small cell lung cancer without targetable driver mutations",
        p: "advanced non-small cell lung cancer, wild-type EGFR/ALK",
        i: "pembrolizumab plus platinum chemotherapy",
        c: "platinum chemotherapy alone",
        o: "overall survival (OS)",
        raw: "advanced NSCLC, pembrolizumab, platinum chemotherapy, overall survival, progression-free survival"
      },
      {
        id: "breast-her2-adc",
        name: "HER2+ Breast Cancer (T-DXd vs T-DM1)",
        description: "HER2-positive unresectable or metastatic breast cancer previously treated with trastuzumab",
        p: "HER2-positive metastatic breast cancer",
        i: "trastuzumab deruxtecan (T-DXd)",
        c: "trastuzumab emtansine (T-DM1)",
        o: "progression-free survival (PFS)",
        raw: "metastatic HER2-positive breast cancer, trastuzumab deruxtecan, T-DM1, progression-free survival, overall survival"
      },
      {
        id: "ovarian-parp",
        name: "Ovarian Cancer (PARP Maintenance vs Placebo)",
        description: "Newly diagnosed advanced ovarian cancer with BRCA1/2 mutation post-platinum response",
        p: "advanced BRCA-mutated ovarian cancer, first-line platinum response",
        i: "olaparib maintenance therapy",
        c: "placebo",
        o: "progression-free survival (PFS)",
        raw: "advanced ovarian cancer, BRCA mutation, olaparib, placebo, progression-free survival"
      }
    ],
    outcomeRules: [
      {
        keywords: ["cancer", "oncology", "tumor", "carcinoma", "melanoma"],
        primary: "overall survival (OS)",
        alternatives: ["progression-free survival (PFS)", "objective response rate (ORR)", "grade 3-4 adverse events"],
        rationale: "Overall survival is the gold standard benchmark of oncologic clinical benefit, followed by progression-free survival under RECIST criteria."
      }
    ],
    systemPromptRole: "You are an expert medical oncologist, clinical trialist, and academic oncology writer specializing in Medical Oncology and Precision Cancer Therapeutics.",
    gapPromptRole: "You are an evidence-mapping engine for Medical Oncology & Cancer Therapeutics with strict scientific editorial standards."
  },

  pediatrics: {
    id: "pediatrics",
    label: "Pediatrics & Neonatal Medicine",
    shortName: "Pediatrics",
    icon: "👶",
    category: "Pediatrics",
    description: "Neonatology, pediatric critical care, general pediatrics, pediatric pulmonology, and infectious diseases.",
    authorityGuidelines: "AAP · ESPGHAN · RCPCH · WHO",
    conditions: [
      "neonatal respiratory distress syndrome (RDS)",
      "pediatric asthma exacerbation",
      "bronchiolitis in infants",
      "pediatric community-acquired pneumonia",
      "neonatal sepsis",
      "pediatric septic shock",
      "type 1 diabetes mellitus in youth",
      "febrile infant < 60 days",
      "kawasaki disease",
      "pediatric epilepsy"
    ],
    interventions: [
      "early CPAP vs intubation and surfactant",
      "inhaled corticosteroids plus long-acting beta-agonists",
      "high-flow nasal cannula (HFNC)",
      "intravenous immunoglobulin (IVIG)",
      "targeted narrow-spectrum antibiotics",
      "continuous glucose monitoring (CGM)",
      "hypothermia therapy for neonatal encephalopathy",
      "oral rehydration solution vs IV fluids"
    ],
    outcomesRanked: [
      "bronchopulmonary dysplasia (BPD) at 36 weeks",
      "in-hospital mortality",
      "pediatric intensive care unit (PICU) admission",
      "length of hospital stay",
      "treatment failure / escalation of respiratory support",
      "time to clinical recovery",
      "coronary artery aneurysm formation",
      "severe neurodevelopmental impairment"
    ],
    terminology: ["AAP", "BPD", "RDS", "NICU", "PICU", "HFNC", "IVIG", "CGM", "HIE"],
    presets: [
      {
        id: "rds-cpap-surfactant",
        name: "Neonatal RDS (Early CPAP vs Prophylactic Surfactant)",
        description: "Extremely preterm infants born at 24 to 28 weeks gestation",
        p: "extremely preterm infants 24-28 weeks gestation",
        i: "early continuous positive airway pressure (CPAP)",
        c: "prophylactic intubation and surfactant administration",
        o: "death or bronchopulmonary dysplasia (BPD)",
        raw: "preterm infants, nasal CPAP, mechanical ventilation, surfactant, bronchopulmonary dysplasia"
      },
      {
        id: "bronchiolitis-hfnc",
        name: "Infant Bronchiolitis (HFNC vs Standard Oxygen)",
        description: "Infants under 12 months with moderate-to-severe viral bronchiolitis",
        p: "infants under 12 months, acute viral bronchiolitis",
        i: "high-flow nasal cannula (HFNC) therapy",
        c: "standard low-flow oxygen therapy",
        o: "treatment failure requiring respiratory support escalation",
        raw: "infant bronchiolitis, high flow nasal cannula, standard oxygen, treatment failure, PICU admission"
      },
      {
        id: "kawasaki-ivig-steroids",
        name: "Kawasaki Disease (IVIG + Prednisolone vs IVIG Alone)",
        description: "Acute Kawasaki disease in high-risk pediatric patients",
        p: "acute Kawasaki disease, high risk for IVIG resistance",
        i: "intravenous immunoglobulin plus prednisolone",
        c: "intravenous immunoglobulin alone",
        o: "coronary artery aneurysm incidence",
        raw: "Kawasaki disease, IVIG, prednisolone, coronary artery aneurysm, treatment resistance"
      }
    ],
    outcomeRules: [
      {
        keywords: ["preterm", "neonat", "rds", "surfactant", "bpd"],
        primary: "death or bronchopulmonary dysplasia at 36 weeks",
        alternatives: ["severe intraventricular hemorrhage (grade III/IV)", "duration of mechanical ventilation", "retinopathy of prematurity"],
        rationale: "BPD and survival without neurosensory impairment represent the defining outcomes of modern neonatology."
      },
      {
        keywords: ["bronchiolitis", "pediatric asthma", "respiratory distress"],
        primary: "treatment failure requiring escalation of respiratory support",
        alternatives: ["PICU admission", "length of hospital stay", "time to clinical resolution"],
        rationale: "Escalation to invasive mechanical ventilation or PICU transfer reflects direct clinical decompensation."
      }
    ],
    systemPromptRole: "You are an expert pediatrician, neonatologist, and pediatric clinical researcher specializing in General Pediatrics and Neonatal Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Pediatrics & Neonatal Medicine with strict scientific editorial standards."
  },

  surgery: {
    id: "surgery",
    label: "General & Minimally Invasive Surgery",
    shortName: "Surgery",
    icon: "🩺",
    category: "Surgery",
    description: "Minimally invasive, robotic, colorectal, bariatric, and acute care abdominal surgery.",
    authorityGuidelines: "ACS · SAGES · EAES · ASCRS",
    conditions: [
      "acute uncomplicated appendicitis",
      "symptomatic cholelithiasis / acute cholecystitis",
      "inguinal hernia",
      "colorectal adenocarcinoma",
      "severe obesity with metabolic syndrome",
      "diverticulitis with abscess",
      "small bowel obstruction"
    ],
    interventions: [
      "laparoscopic surgery",
      "robotic-assisted surgery",
      "conservative antibiotic therapy (non-operative)",
      "open surgical resection",
      "bariatric metabolic surgery (sleeve gastrectomy vs bypass)",
      "enhanced recovery after surgery (ERAS) protocols",
      "laparoscopic mesh repair (TEP / TAPP)"
    ],
    outcomesRanked: [
      "30-day major postoperative complications (Clavien-Dindo >= 3)",
      "treatment success / non-operative recurrence",
      "surgical site infection (SSI)",
      "anastomotic leak rate",
      "length of postoperative hospital stay",
      "readmission rate at 30 days",
      "long-term recurrence rate",
      "postoperative pain and return to baseline activity"
    ],
    terminology: ["ACS", "SAGES", "Clavien-Dindo", "ERAS", "TEP", "TAPP", "MIS", "SSI"],
    presets: [
      {
        id: "appendicitis-antibiotics",
        name: "Acute Appendicitis (Antibiotics vs Appendectomy)",
        description: "Adults with imaging-confirmed uncomplicated acute appendicitis",
        p: "adults with uncomplicated acute appendicitis",
        i: "primary antibiotic therapy",
        c: "laparoscopic appendectomy",
        o: "treatment success without recurrence at 1 year",
        raw: "acute uncomplicated appendicitis, antibiotics, laparoscopic appendectomy, treatment failure, recurrence"
      },
      {
        id: "cholecystitis-early-delayed",
        name: "Acute Cholecystitis (Early vs Delayed Cholecystectomy)",
        description: "Acute calculous cholecystitis presenting within 72 hours of symptom onset",
        p: "acute calculous cholecystitis within 72 hours",
        i: "early laparoscopic cholecystectomy (< 72 hours)",
        c: "delayed interval laparoscopic cholecystectomy (6-8 weeks)",
        o: "overall 30-day complications and total hospital stay",
        raw: "acute cholecystitis, early laparoscopic cholecystectomy, delayed cholecystectomy, complications, length of stay"
      },
      {
        id: "hernia-lap-open",
        name: "Inguinal Hernia (Laparoscopic TEP/TAPP vs Open Lichtenstein)",
        description: "Primary unilateral inguinal hernia in active adults",
        p: "adult primary unilateral inguinal hernia",
        i: "laparoscopic repair (TEP or TAPP)",
        c: "open Lichtenstein tension-free mesh repair",
        o: "chronic postoperative groin pain and recurrence",
        raw: "inguinal hernia, laparoscopic TEP, Lichtenstein open repair, chronic pain, hernia recurrence"
      }
    ],
    outcomeRules: [
      {
        keywords: ["surgery", "operative", "appendic", "cholecyst", "hernia"],
        primary: "30-day major postoperative complications (Clavien-Dindo >= 3)",
        alternatives: ["surgical site infection", "hospital length of stay", "disease recurrence at 1 year"],
        rationale: "Clavien-Dindo graded complications objectively standardize surgical safety and postoperative outcomes."
      }
    ],
    systemPromptRole: "You are an expert general and minimally invasive surgeon, academic surgical trialist, and surgical literature editor.",
    gapPromptRole: "You are an evidence-mapping engine for General & Minimally Invasive Surgery with strict scientific editorial standards."
  },

  internal_med: {
    id: "internal_med",
    label: "Internal Medicine & Nephrology",
    shortName: "Internal Medicine",
    icon: "🏥",
    category: "Internal Medicine",
    description: "Multimorbidity, chronic kidney disease, hypertension, systemic autoimmune disorders, and hospital medicine.",
    authorityGuidelines: "ACP · KDIGO · EULAR · NICE",
    conditions: [
      "chronic kidney disease (CKD) stages 3-4",
      "diabetic kidney disease",
      "type 2 diabetes with albuminuria",
      "resistant hypertension",
      "systemic lupus erythematosus",
      "rheumatoid arthritis",
      "acute kidney injury in sepsis",
      "chronic obstructive pulmonary disease (COPD)"
    ],
    interventions: [
      "SGLT2 inhibitors",
      "non-steroidal mineralocorticoid receptor antagonists (finerenone)",
      "GLP-1 receptor agonists",
      "targeted biologic DMARDs",
      "balanced crystalloids vs saline in resuscitation",
      "triple inhaled therapy (ICS/LABA/LAMA)",
      "intensive vs standard blood pressure control"
    ],
    outcomesRanked: [
      "sustained >= 40% eGFR decline or end-stage kidney disease",
      "all-cause mortality",
      "major adverse cardiovascular events (MACE)",
      "major adverse kidney events at 30 days (MAKE30)",
      "severe COPD exacerbations requiring hospitalization",
      "clinical disease remission (DAS28 / SLEDAI)"
    ],
    terminology: ["KDIGO", "eGFR", "ESKD", "MAKE30", "SGLT2i", "DMARD", "COPD", "ACR"],
    presets: [
      {
        id: "ckd-sglt2",
        name: "Chronic Kidney Disease (Dapagliflozin vs Placebo)",
        description: "Patients with CKD stages 2-4 with or without type 2 diabetes",
        p: "chronic kidney disease with albuminuria, with or without diabetes",
        i: "dapagliflozin",
        c: "placebo",
        o: "sustained eGFR decline, end-stage kidney disease, or renal death",
        raw: "chronic kidney disease, dapagliflozin, placebo, eGFR decline, end stage renal disease"
      },
      {
        id: "sepsis-fluids",
        name: "Critically Ill Sepsis (Balanced Crystalloids vs Saline)",
        description: "Hospitalized adults requiring intravenous fluid resuscitation for sepsis",
        p: "critically ill septic adults in emergency/intensive care",
        i: "balanced crystalloids (lactated Ringer's or Plasma-Lyte)",
        c: "0.9% normal saline",
        o: "major adverse kidney events within 30 days (MAKE30)",
        raw: "sepsis fluid resuscitation, balanced crystalloids, normal saline, acute kidney injury, MAKE30"
      }
    ],
    outcomeRules: [
      {
        keywords: ["kidney", "renal", "ckd", "nephro", "egfr"],
        primary: "sustained eGFR decline, end-stage kidney disease, or renal death",
        alternatives: ["all-cause mortality", "cardiovascular death", "urinary albumin-to-creatinine ratio change"],
        rationale: "Halting progressive loss of renal parenchymal filtration and delaying dialysis or transplantation are paramount."
      }
    ],
    systemPromptRole: "You are an expert internist, clinical epidemiologist, and academic medical writer specializing in Internal Medicine and Nephrology.",
    gapPromptRole: "You are an evidence-mapping engine for Internal Medicine & Clinical Specialties with strict scientific editorial standards."
  },

  neurology: {
    id: "neurology",
    label: "Neurology & Stroke Medicine",
    shortName: "Neurology",
    icon: "🧠",
    category: "Neuroscience",
    description: "Acute ischemic stroke, neurovascular emergencies, epilepsy, Parkinson's disease, and multiple sclerosis.",
    authorityGuidelines: "AAN · ESO · AHA/ASA · ILAE",
    conditions: [
      "acute ischemic stroke with large vessel occlusion",
      "wake-up ischemic stroke / extended time window",
      "drug-resistant focal epilepsy",
      "early Parkinson's disease",
      "relapsing-remitting multiple sclerosis (RRMS)",
      "refractory status epilepticus",
      "chronic migraine"
    ],
    interventions: [
      "endovascular mechanical thrombectomy",
      "tenecteplase vs alteplase",
      "high-efficacy disease-modifying therapies (anti-CD20)",
      "deep brain stimulation (DBS)",
      "CGRP monoclonal antibodies",
      "responsive neurostimulation (RNS)",
      "dual antiplatelet therapy (DAPT) for minor stroke"
    ],
    outcomesRanked: [
      "modified Rankin Scale (mRS) score 0-2 (functional independence) at 90 days",
      "symptomatic intracranial hemorrhage (sICH)",
      "all-cause mortality at 90 days",
      "annualized relapse rate (ARR)",
      "confirmed disability worsening (CDW) at 24 weeks",
      "monthly migraine headache days (MMD) reduction",
      "seizure freedom rate at 12 months"
    ],
    terminology: ["mRS", "LVO", "EVT", "sICH", "tPA", "TNK", "DBS", "EDSS", "CGRP"],
    presets: [
      {
        id: "stroke-thrombectomy",
        name: "Acute Stroke (Thrombectomy + Thrombolysis vs Thrombolysis Alone)",
        description: "Acute anterior circulation large vessel occlusion stroke within 6 hours",
        p: "acute ischemic stroke, anterior circulation large vessel occlusion",
        i: "endovascular mechanical thrombectomy plus intravenous thrombolysis",
        c: "intravenous thrombolysis alone",
        o: "functional independence (modified Rankin Scale 0-2 at 90 days)",
        raw: "acute ischemic stroke, large vessel occlusion, mechanical thrombectomy, alteplase, functional outcome mRS"
      },
      {
        id: "stroke-tenecteplase",
        name: "Stroke Thrombolysis (Tenecteplase vs Alteplase)",
        description: "Acute ischemic stroke eligible for intravenous thrombolysis within 4.5 hours",
        p: "acute ischemic stroke within 4.5 hours of onset",
        i: "intravenous tenecteplase (0.25 mg/kg)",
        c: "intravenous alteplase (0.9 mg/kg)",
        o: "excellent functional recovery (mRS 0-1) and symptomatic ICH",
        raw: "acute ischemic stroke, tenecteplase, alteplase, functional recovery, intracranial hemorrhage"
      }
    ],
    outcomeRules: [
      {
        keywords: ["stroke", "ischemic", "thrombectomy", "neurol"],
        primary: "functional independence (modified Rankin Scale 0-2 at 90 days)",
        alternatives: ["symptomatic intracranial hemorrhage", "all-cause mortality at 90 days", "recanalization rate (eTICI)"],
        rationale: "Functional independence at 90 days on the modified Rankin Scale is the universally validated primary neurological disability metric."
      }
    ],
    systemPromptRole: "You are an expert neurologist, vascular neuro-interventionalist, and academic clinical trials investigator in Neurology and Stroke Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Neurology & Neuroscience with strict scientific editorial standards."
  },

  endocrinology: {
    id: "endocrinology",
    label: "Endocrinology & Metabolism",
    shortName: "Endocrinology",
    icon: "🩸",
    category: "Metabolic",
    description: "Type 2 diabetes, obesity medicine, thyroid disorders, osteoporosis, and adrenal-pituitary endocrinology.",
    authorityGuidelines: "ADA · Endocrine Society · EASD · AACE",
    conditions: [
      "type 2 diabetes mellitus with high cardiovascular risk",
      "obesity and overweight with metabolic complications",
      "postmenopausal osteoporosis with high fracture risk",
      "subclinical hypothyroidism in older adults",
      "primary hyperparathyroidism",
      "diabetic peripheral neuropathy"
    ],
    interventions: [
      "dual GIP/GLP-1 receptor agonist (tirzepatide)",
      "GLP-1 receptor agonist (semaglutide)",
      "SGLT2 inhibitors",
      "anabolic bone agents (romosozumab, teriparatide)",
      "bisphosphonates (zoledronic acid)",
      "levothyroxine therapy vs observation",
      "continuous glucose monitoring (CGM)"
    ],
    outcomesRanked: [
      "percentage change in body weight at 52-72 weeks",
      "mean HbA1c reduction from baseline",
      "major adverse cardiovascular events (MACE)",
      "new clinical and vertebral fractures",
      "bone mineral density (BMD) percentage increase",
      "hypoglycemia incidence (level 2 or 3)",
      "all-cause mortality"
    ],
    terminology: ["ADA", "EASD", "HbA1c", "MACE", "BMD", "CGM", "T2D", "GLP-1", "GIP"],
    presets: [
      {
        id: "obesity-tirzepatide",
        name: "Obesity (Tirzepatide vs Semaglutide)",
        description: "Adults with obesity or overweight with at least one weight-related complication",
        p: "adults with obesity or overweight without diabetes",
        i: "tirzepatide once weekly",
        c: "semaglutide 2.4 mg once weekly",
        o: "percentage total body weight loss at 72 weeks",
        raw: "obesity, tirzepatide, semaglutide, body weight reduction, cardiometabolic risk"
      },
      {
        id: "osteoporosis-romosozumab",
        name: "Severe Osteoporosis (Romosozumab vs Alendronate)",
        description: "Postmenopausal women at high risk of osteoporotic fracture",
        p: "postmenopausal women with severe osteoporosis and prior fracture",
        i: "romosozumab followed by antiresorptive therapy",
        c: "alendronate alone",
        o: "new clinical vertebral and non-vertebral fractures",
        raw: "postmenopausal osteoporosis, romosozumab, alendronate, vertebral fracture, bone mineral density"
      }
    ],
    outcomeRules: [
      {
        keywords: ["diabetes", "glucose", "hba1c", "t2d"],
        primary: "HbA1c reduction and cardiovascular death / MACE",
        alternatives: ["body weight change", "hypoglycemia incidence", "microvascular composite"],
        rationale: "Glycemic optimization must balance durable HbA1c lowering with proven macrovascular risk reduction."
      },
      {
        keywords: ["obesity", "weight loss", "bmi", "overweight"],
        primary: "percentage total body weight loss at 52-72 weeks",
        alternatives: ["metabolic syndrome resolution", "cardiovascular risk reduction", "gastrointestinal adverse events"],
        rationale: "Sustained categorical weight loss (>=15%) drives remission of obstructive sleep apnea, steatotic liver disease, and hypertension."
      }
    ],
    systemPromptRole: "You are an expert endocrinologist, metabolic clinical investigator, and academic endocrine medical writer.",
    gapPromptRole: "You are an evidence-mapping engine for Endocrinology & Metabolism with strict scientific editorial standards."
  }
};

export const SPECIALTY_CATEGORIES = [
  "All Specialties",
  "Women's Health",
  "Cardiovascular",
  "Oncology",
  "Pediatrics",
  "Surgery",
  "Internal Medicine",
  "Neuroscience",
  "Metabolic"
] as const;

export function getSpecialtyDefinition(id: string): SpecialtyDefinition {
  if (id in SPECIALTIES) {
    return SPECIALTIES[id];
  }
  // Fallbacks for legacy keys
  if (id === "infertility" || id === "gynecology" || id === "obstetrics") {
    return SPECIALTIES.obgyn;
  }
  return SPECIALTIES.obgyn;
}
