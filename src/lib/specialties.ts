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
  category:
    | "Women's Health"
    | "Cardiovascular"
    | "Oncology"
    | "Pediatrics"
    | "Surgery"
    | "Internal Medicine"
    | "Neuroscience"
    | "Metabolic"
    | "Emergency & Critical Care"
    | "Psychiatry & Behavioral Health"
    | "Orthopedics & Musculoskeletal"
    | "Pulmonology & Respiratory"
    | "Gastroenterology & Hepatology"
    | "Infectious Diseases"
    | "Dermatology";
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
  },

  emergency_med: {
    id: "emergency_med",
    label: "Emergency Medicine & Critical Care",
    shortName: "Emergency Med",
    icon: "🚑",
    category: "Emergency & Critical Care",
    description: "Acute resuscitation, hemodynamic instability, trauma, sepsis, respiratory failure, and emergency procedures.",
    authorityGuidelines: "ACEP · SCCM · ERC · AHA",
    conditions: [
      "septic shock",
      "out-of-hospital cardiac arrest (OHCA)",
      "acute respiratory distress syndrome (ARDS)",
      "severe traumatic brain injury (TBI)",
      "massive pulmonary embolism",
      "status epilepticus in ED",
      "anaphylactic shock",
      "severe hemorrhagic shock"
    ],
    interventions: [
      "targeted temperature management (TTM)",
      "early goal-directed norepinephrine resuscitation",
      "extracorporeal membrane oxygenation (ECMO / ECPR)",
      "point-of-care ultrasound (POCUS) guided resuscitation",
      "early tranexamic acid in major trauma",
      "rapid sequence intubation (RSI) with ketamine",
      "balanced crystalloids vs normal saline",
      "catheter-directed thrombolysis"
    ],
    outcomesRanked: [
      "30-day all-cause mortality",
      "favorable neurological outcome (CPC 1-2 at discharge)",
      "in-hospital mortality",
      "ventilator-free days at 28 days",
      "ICU length of stay",
      "vasopressor-free hours at 72 hours",
      "major bleeding complications"
    ],
    terminology: ["ACEP", "SCCM", "ROSC", "OHCA", "ARDS", "TTM", "ECPR", "POCUS", "RSI", "CPC"],
    presets: [
      {
        id: "cardiac-arrest-ttm",
        name: "Cardiac Arrest (TTM 33°C vs Normothermia)",
        description: "Comatose adult survivors of out-of-hospital cardiac arrest",
        p: "comatose adults after resuscitation from out-of-hospital cardiac arrest",
        i: "targeted temperature management at 33°C",
        c: "targeted normothermia (36-37.5°C)",
        o: "favorable neurological outcome (CPC 1-2) at 6 months",
        raw: "cardiac arrest, targeted temperature management, hypothermia, neurological outcome, CPC score"
      },
      {
        id: "trauma-txa",
        name: "Trauma Hemorrhage (Early Tranexamic Acid vs Placebo)",
        description: "Adult trauma patients with or at risk of significant hemorrhage within 3 hours",
        p: "adult trauma patients with significant bleeding within 3 hours",
        i: "intravenous tranexamic acid (CRASH-2 protocol)",
        c: "placebo",
        o: "all-cause mortality at 28 days",
        raw: "severe trauma, tranexamic acid, hemorrhage, 28-day mortality, thromboembolic events"
      },
      {
        id: "septic-shock-norepi",
        name: "Septic Shock (Early Norepinephrine vs Delayed Vasopressor)",
        description: "Adults presenting to the emergency department with fluid-refractory septic shock",
        p: "adults with fluid-refractory septic shock in emergency department",
        i: "early continuous norepinephrine infusion within 1 hour",
        c: "standard delayed vasopressor initiation after fluid completion",
        o: "28-day in-hospital mortality",
        raw: "septic shock, early norepinephrine, vasopressor timing, in-hospital mortality, lactate clearance"
      }
    ],
    outcomeRules: [
      {
        keywords: ["cardiac arrest", "resuscitation", "rosc", "hypothermia", "ttm"],
        primary: "favorable neurological outcome (CPC 1-2 at discharge)",
        alternatives: ["all-cause mortality at 6 months", "in-hospital mortality", "time to ROSC"],
        rationale: "Survival with functional neurological recovery defines successful emergency cardiac arrest resuscitation."
      },
      {
        keywords: ["septic shock", "sepsis", "vasopressor", "norepinephrine"],
        primary: "28-day all-cause mortality",
        alternatives: ["time to shock reversal", "ICU length of stay", "lactate clearance at 6 hours"],
        rationale: "Rapid hemodynamic stabilization in sepsis is judged primarily by short-term survival."
      }
    ],
    systemPromptRole: "You are an expert emergency physician, resuscitation trialist, and intensivist specializing in Emergency Medicine and Critical Care.",
    gapPromptRole: "You are an evidence-mapping engine for Emergency Medicine & Critical Care with strict scientific editorial standards."
  },

  psychiatry: {
    id: "psychiatry",
    label: "Psychiatry & Behavioral Health",
    shortName: "Psychiatry",
    icon: "🧩",
    category: "Psychiatry & Behavioral Health",
    description: "Major mood disorders, treatment-resistant depression, schizophrenia, psychopharmacology, and neuromodulation.",
    authorityGuidelines: "APA · CANMAT · NICE · WFSBP",
    conditions: [
      "major depressive disorder (MDD)",
      "treatment-resistant depression (TRD)",
      "bipolar I and II disorder (depressive and manic episodes)",
      "schizophrenia and schizoaffective disorder",
      "generalized anxiety disorder (GAD)",
      "obsessive-compulsive disorder (OCD)",
      "post-traumatic stress disorder (PTSD)",
      "adult attention-deficit/hyperactivity disorder (ADHD)"
    ],
    interventions: [
      "esketamine nasal spray",
      "repetitive transcranial magnetic stimulation (rTMS)",
      "electroconvulsive therapy (ECT)",
      "cognitive behavioral therapy (CBT)",
      "second-generation atypical antipsychotics",
      "SSRIs and SNRIs",
      "lithium maintenance therapy",
      "adjunctive atypical antipsychotics (aripiprazole, brexpiprazole)"
    ],
    outcomesRanked: [
      "clinical remission (MADRS <= 10 or HAM-D <= 7)",
      "treatment response (>= 50% symptom reduction)",
      "time to relapse or recurrence",
      "all-cause treatment discontinuation",
      "suicidality / suicide attempt rate",
      "functional recovery (Sheehan Disability Scale)",
      "metabolic and extrapyramidal adverse events"
    ],
    terminology: ["APA", "CANMAT", "MADRS", "HAM-D", "PANSS", "CBT", "rTMS", "ECT", "TRD", "MDD"],
    presets: [
      {
        id: "trd-esketamine",
        name: "Treatment-Resistant Depression (Esketamine vs Quetiapine)",
        description: "Adults with major depressive disorder failing >= 2 prior antidepressant trials",
        p: "treatment-resistant major depressive disorder",
        i: "adjunctive esketamine nasal spray plus SSRI/SNRI",
        c: "adjunctive quetiapine extended-release plus SSRI/SNRI",
        o: "clinical remission at 8 weeks (MADRS <= 10)",
        raw: "treatment-resistant depression, esketamine, quetiapine, MADRS remission, relapse prevention"
      },
      {
        id: "mdd-rtms",
        name: "MDD (Repetitive TMS vs Sham Stimulation)",
        description: "Pharmacotherapy-resistant unipolar major depressive episode",
        p: "pharmacoresistant major depressive disorder",
        i: "high-frequency left prefrontal rTMS",
        c: "sham rTMS stimulation",
        o: "treatment response and remission rates at 6 weeks",
        raw: "major depressive disorder, transcranial magnetic stimulation, sham TMS, response rate, MADRS"
      },
      {
        id: "bipolar-lithium",
        name: "Bipolar Maintenance (Lithium vs Valproate)",
        description: "Bipolar I disorder requiring long-term maintenance mood stabilization",
        p: "bipolar I disorder in maintenance phase",
        i: "lithium monotherapy",
        c: "valproate monotherapy",
        o: "time to recurrence of any mood episode",
        raw: "bipolar I disorder, lithium, valproate, mood episode recurrence, hospital admission"
      }
    ],
    outcomeRules: [
      {
        keywords: ["depression", "mdd", "trd", "antidepressant", "esketamine", "madrs"],
        primary: "clinical remission (MADRS <= 10 or HAM-D <= 7)",
        alternatives: ["treatment response (>= 50% symptom reduction)", "time to relapse", "all-cause discontinuation"],
        rationale: "Full syndromal remission rather than partial response is required to restore psychosocial function and prevent relapse."
      },
      {
        keywords: ["bipolar", "lithium", "valproate", "mania"],
        primary: "time to recurrence of any mood episode",
        alternatives: ["time to depressive relapse", "time to manic relapse", "all-cause medication discontinuation"],
        rationale: "Maintenance stability is defined by prolonging euthymia and preventing mood episode relapse."
      }
    ],
    systemPromptRole: "You are an expert academic psychiatrist, neuropsychopharmacologist, and behavioral clinical trialist specializing in Psychiatry and Mental Health.",
    gapPromptRole: "You are an evidence-mapping engine for Psychiatry & Behavioral Health with strict scientific editorial standards."
  },

  orthopedics: {
    id: "orthopedics",
    label: "Orthopedic Surgery & Sports Medicine",
    shortName: "Orthopedics",
    icon: "🦴",
    category: "Orthopedics & Musculoskeletal",
    description: "Joint arthroplasty, sports ligamentous reconstruction, musculoskeletal trauma, spine disorders, and cartilage restoration.",
    authorityGuidelines: "AAOS · BOA · EFORT · ESSKA",
    conditions: [
      "end-stage knee osteoarthritis",
      "end-stage hip osteoarthritis",
      "anterior cruciate ligament (ACL) rupture",
      "full-thickness rotator cuff tear",
      "displaced femoral neck fracture in elderly",
      "lumbar disc herniation with radiculopathy",
      "femoroacetabular impingement (FAI)",
      "subacromial shoulder impingement"
    ],
    interventions: [
      "total knee arthroplasty (TKA, robotic-assisted)",
      "conventional manual total knee arthroplasty",
      "total hip arthroplasty (THA, direct anterior approach)",
      "ACL reconstruction (autograft bone-tendon-bone vs hamstring)",
      "arthroscopic rotator cuff repair",
      "hemiarthroplasty vs total hip arthroplasty for femoral neck fracture",
      "lumbar microdiscectomy vs structured conservative therapy",
      "platelet-rich plasma (PRP) intra-articular injections"
    ],
    outcomesRanked: [
      "validated patient-reported outcome measures (KOOS / WOMAC / Oxford score)",
      "implant survivorship and revision rate at 5-10 years",
      "return to pre-injury sport or baseline activity",
      "major postoperative complications (prosthetic joint infection, DVT)",
      "visual analogue scale (VAS) pain score reduction at 12 months",
      "range of motion and functional recovery"
    ],
    terminology: ["AAOS", "TKA", "THA", "ACL", "KOOS", "WOMAC", "PROMs", "PRP", "FAI", "PJI"],
    presets: [
      {
        id: "tka-robotic-manual",
        name: "Knee Arthroplasty (Robotic vs Conventional Manual TKA)",
        description: "End-stage primary knee osteoarthritis undergoing total knee replacement",
        p: "end-stage primary knee osteoarthritis",
        i: "robotic-assisted total knee arthroplasty",
        c: "conventional manual total knee arthroplasty",
        o: "patient-reported joint function (KOOS / WOMAC) and revision rate",
        raw: "knee osteoarthritis, robotic total knee arthroplasty, manual TKA, patient reported outcomes, revision rate"
      },
      {
        id: "acl-reconstruction-rehab",
        name: "ACL Rupture (Early Reconstruction vs Rehabilitation)",
        description: "Young active adults with acute anterior cruciate ligament rupture",
        p: "active young adults with acute ACL rupture",
        i: "early surgical ACL reconstruction",
        c: "structured rehabilitation with optional delayed ACL reconstruction",
        o: "KOOS functional score and secondary meniscus injury at 5 years",
        raw: "ACL rupture, early ACL reconstruction, conservative rehabilitation, KOOS score, meniscal tears"
      },
      {
        id: "hip-fracture-tha-hemi",
        name: "Hip Fracture (Total Hip Arthroplasty vs Hemiarthroplasty)",
        description: "Active elderly patients with displaced intracapsular femoral neck fractures",
        p: "active elderly patients with displaced femoral neck fracture",
        i: "total hip arthroplasty (THA)",
        c: "hemiarthroplasty",
        o: "reoperation rate and functional mobility at 2 years",
        raw: "displaced femoral neck fracture, total hip arthroplasty, hemiarthroplasty, reoperation rate, mobility score"
      }
    ],
    outcomeRules: [
      {
        keywords: ["arthroplasty", "tka", "tha", "knee replacement", "hip replacement", "implant"],
        primary: "implant survivorship and revision rate at 5-10 years",
        alternatives: ["KOOS / WOMAC patient-reported functional score", "prosthetic joint infection rate", "pain score at 1 year"],
        rationale: "Long-term joint survivorship and freedom from revision are the primary benchmarks of arthroplasty efficacy."
      },
      {
        keywords: ["acl", "ligament", "rotator cuff", "meniscus", "sports"],
        primary: "return to pre-injury sport and validated functional score (KOOS/IKDC)",
        alternatives: ["graft failure / re-rupture rate", "secondary meniscal tears", "pain reduction"],
        rationale: "Restoration of biomechanical stability and athletic function represents the definitive outcome in sports orthopedics."
      }
    ],
    systemPromptRole: "You are an expert orthopedic surgeon, biomechanics researcher, and musculoskeletal clinical trialist specializing in Orthopedic Surgery and Sports Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Orthopedics & Musculoskeletal Medicine with strict scientific editorial standards."
  },

  pulmonology: {
    id: "pulmonology",
    label: "Pulmonology & Respiratory Medicine",
    shortName: "Pulmonology",
    icon: "🫁",
    category: "Pulmonology & Respiratory",
    description: "Obstructive airway diseases, interstitial lung fibrosis, pulmonary hypertension, and acute lung injury.",
    authorityGuidelines: "ATS · ERS · GOLD · GINA",
    conditions: [
      "chronic obstructive pulmonary disease (COPD) with frequent exacerbations",
      "severe uncontrolled eosinophilic asthma",
      "idiopathic pulmonary fibrosis (IPF)",
      "pulmonary arterial hypertension (PAH)",
      "moderate-to-severe obstructive sleep apnea (OSA)",
      "non-cystic fibrosis bronchiectasis",
      "pulmonary sarcoidosis"
    ],
    interventions: [
      "triple inhaled therapy (ICS/LABA/LAMA)",
      "dual bronchodilator therapy (LABA/LAMA)",
      "targeted biologic therapies (dupilumab, tezepelumab, mepolizumab)",
      "antifibrotic agents (nintedanib, pirfenidone)",
      "prostacyclin receptor agonists and endothelin antagonists",
      "continuous positive airway pressure (CPAP)",
      "bronchoscopic lung volume reduction (BLVR) with endobronchial valves",
      "long-term azithromycin maintenance"
    ],
    outcomesRanked: [
      "annualized rate of moderate-to-severe exacerbations",
      "annual rate of decline in forced vital capacity (FVC)",
      "all-cause mortality",
      "change in trough FEV1 from baseline",
      "St. George's Respiratory Questionnaire (SGRQ) score",
      "6-minute walk distance (6MWD)",
      "hospitalization for acute respiratory failure"
    ],
    terminology: ["ATS", "ERS", "GOLD", "GINA", "FEV1", "FVC", "SGRQ", "6MWD", "IPF", "PAH"],
    presets: [
      {
        id: "copd-triple-dual",
        name: "COPD (Triple Inhaled ICS/LABA/LAMA vs Dual LABA/LAMA)",
        description: "Symptomatic COPD patients with a history of frequent exacerbations",
        p: "symptomatic COPD with history of >= 1 exacerbation",
        i: "single-inhaler triple therapy (ICS/LABA/LAMA)",
        c: "dual bronchodilator therapy (LABA/LAMA)",
        o: "annualized rate of moderate or severe COPD exacerbations",
        raw: "COPD, triple therapy, LABA LAMA, exacerbation rate, all-cause mortality, FEV1"
      },
      {
        id: "ipf-antifibrotic",
        name: "IPF (Nintedanib vs Pirfenidone)",
        description: "Adults with confirmed idiopathic pulmonary fibrosis and mild-to-moderate impairment",
        p: "idiopathic pulmonary fibrosis, mild-to-moderate restriction",
        i: "nintedanib 150 mg twice daily",
        c: "pirfenidone titrated to 2403 mg daily",
        o: "annual rate of decline in forced vital capacity (FVC)",
        raw: "idiopathic pulmonary fibrosis, nintedanib, pirfenidone, FVC decline, disease progression"
      },
      {
        id: "asthma-biologics",
        name: "Severe Asthma (Dupilumab vs Placebo/Standard Inhaled Care)",
        description: "Severe uncontrolled asthma with elevated blood eosinophils or FeNO",
        p: "severe uncontrolled asthma with type 2 inflammatory phenotype",
        i: "add-on dupilumab subcutaneous every 2 weeks",
        c: "standard high-dose inhaled therapy alone",
        o: "annualized severe asthma exacerbation rate and FEV1 improvement",
        raw: "severe eosinophilic asthma, dupilumab, exacerbation rate, FEV1, oral corticosteroid reduction"
      }
    ],
    outcomeRules: [
      {
        keywords: ["copd", "asthma", "exacerbation", "bronch", "fev1"],
        primary: "annualized rate of moderate-to-severe exacerbations",
        alternatives: ["all-cause mortality", "trough FEV1 change from baseline", "SGRQ quality of life score"],
        rationale: "Exacerbation frequency directly drives lung function decline, healthcare costs, and mortality in airway disease."
      },
      {
        keywords: ["fibrosis", "ipf", "interstitial", "fvc", "nintedanib", "pirfenidone"],
        primary: "annual rate of decline in forced vital capacity (FVC)",
        alternatives: ["all-cause mortality", "acute exacerbation of IPF", "progression-free survival"],
        rationale: "FVC trajectory is the validated physiological surrogate of parenchymal progression and survival in pulmonary fibrosis."
      }
    ],
    systemPromptRole: "You are an expert pulmonologist, respiratory physiologist, and clinical investigator specializing in Pulmonology and Respiratory Medicine.",
    gapPromptRole: "You are an evidence-mapping engine for Pulmonology & Respiratory Medicine with strict scientific editorial standards."
  },

  gastroenterology: {
    id: "gastroenterology",
    label: "Gastroenterology & Hepatology",
    shortName: "Gastroenterology",
    icon: "🧪",
    category: "Gastroenterology & Hepatology",
    description: "Inflammatory bowel disease, steatotic liver disease, cirrhosis, portal hypertension, and acute gastrointestinal emergencies.",
    authorityGuidelines: "AGA · ACG · ECCO · EASL",
    conditions: [
      "moderate-to-severe Crohn's disease",
      "moderate-to-severe ulcerative colitis",
      "metabolic dysfunction-associated steatohepatitis (MASH / NASH)",
      "decompensated liver cirrhosis with variceal bleeding",
      "acute severe pancreatitis",
      "irritable bowel syndrome with diarrhea (IBS-D)",
      "eosinophilic esophagitis"
    ],
    interventions: [
      "IL-23 p19 inhibitors (risankizumab, mirikizumab)",
      "anti-TNF agents (infliximab, adalimumab)",
      "oral JAK inhibitors (upadacitinib, tofacitinib)",
      "resmetirom (THR-beta agonist)",
      "early preemptive TIPS (transjugular portosystemic shunt)",
      "early aggressive goal-directed fluid resuscitation (lactated Ringer's)",
      "fecal microbiota transplantation (FMT)",
      "endoscopic mucosal resection"
    ],
    outcomesRanked: [
      "endoscopic mucosal healing / clinical remission at 52 weeks",
      "MASH resolution without worsening of liver fibrosis",
      "corticosteroid-free sustained clinical remission",
      "6-week all-cause mortality (variceal bleeding)",
      "progression to decompensated cirrhosis or liver transplantation",
      "persistent organ failure in acute pancreatitis",
      "treatment-related serious adverse events"
    ],
    terminology: ["AGA", "ACG", "ECCO", "EASL", "IBD", "MASH", "NASH", "TIPS", "CDAI", "SES-CD"],
    presets: [
      {
        id: "crohn-il23-antitnf",
        name: "Crohn's Disease (IL-23 Inhibitors vs Anti-TNF)",
        description: "Moderate-to-severe active Crohn's disease naive or refractory to biologics",
        p: "moderate-to-severe active Crohn's disease",
        i: "risankizumab intravenous induction then subcutaneous maintenance",
        c: "ustekinumab or adalimumab standard maintenance",
        o: "endoscopic mucosal healing and clinical remission at 52 weeks",
        raw: "Crohn's disease, risankizumab, ustekinumab, endoscopic healing, clinical remission"
      },
      {
        id: "mash-resmetirom",
        name: "MASH Liver Fibrosis (Resmetirom vs Placebo)",
        description: "Metabolic dysfunction-associated steatohepatitis with moderate-to-advanced fibrosis (stages F2-F3)",
        p: "biopsy-confirmed MASH with stage F2-F3 fibrosis",
        i: "resmetirom 100 mg once daily",
        c: "placebo",
        o: "MASH resolution and at least 1-stage fibrosis improvement",
        raw: "MASH, resmetirom, placebo, steatohepatitis resolution, liver fibrosis improvement"
      },
      {
        id: "cirrhosis-early-tips",
        name: "Variceal Bleeding (Early TIPS vs Standard Endoscopy/Medical)",
        description: "Cirrhotic patients with high-risk acute esophageal variceal hemorrhage (Child-Pugh B or C)",
        p: "cirrhotic patients with acute variceal hemorrhage, Child-Pugh class B or C",
        i: "early preemptive TIPS within 72 hours",
        c: "standard medical therapy (vasoactive drugs) plus endoscopic band ligation",
        o: "treatment failure and 6-week all-cause mortality",
        raw: "cirrhosis, acute variceal bleeding, early TIPS, endoscopic band ligation, 6-week mortality, rebleeding"
      }
    ],
    outcomeRules: [
      {
        keywords: ["crohn", "ulcerative colitis", "ibd", "colitis", "mucosal"],
        primary: "endoscopic mucosal healing and corticosteroid-free remission",
        alternatives: ["clinical response (CDAI / Mayo score)", "surgery / bowel resection rate", "quality of life (IBDQ)"],
        rationale: "Objective endoscopic mucosal healing alters disease natural history and prevents progressive bowel damage."
      },
      {
        keywords: ["mash", "nash", "liver fibrosis", "steatohepatitis", "cirrhosis"],
        primary: "MASH resolution without worsening of liver fibrosis",
        alternatives: ["at least 1-stage improvement in fibrosis", "progression to cirrhosis", "all-cause mortality"],
        rationale: "Dual histological endpoints of steatohepatitis resolution and fibrosis regression predict long-term hepatic survival."
      }
    ],
    systemPromptRole: "You are an expert gastroenterologist, hepatologist, and digestive clinical trialist specializing in Gastroenterology and Hepatology.",
    gapPromptRole: "You are an evidence-mapping engine for Gastroenterology & Hepatology with strict scientific editorial standards."
  },

  infectious_disease: {
    id: "infectious_disease",
    label: "Infectious Diseases & Antimicrobial Stewardship",
    shortName: "Infectious Disease",
    icon: "🦠",
    category: "Infectious Diseases",
    description: "Multidrug-resistant pathogens, antimicrobial stewardship, bacteremia, HIV, opportunistic infections, and sepsis.",
    authorityGuidelines: "IDSA · ESCMID · WHO · CDC",
    conditions: [
      "methicillin-resistant Staphylococcus aureus (MRSA) bacteremia",
      "carbapenem-resistant Enterobacterales (CRE) infections",
      "recurrent Clostridioides difficile infection (CDI)",
      "hospital-acquired and ventilator-associated pneumonia (HAP/VAP)",
      "invasive candidiasis / candidemia",
      "treatment-naive HIV-1 infection",
      "multidrug-resistant Pseudomonas aeruginosa pneumonia"
    ],
    interventions: [
      "ceftazidime-avibactam vs polymyxin/colistin regimens",
      "daptomycin high-dose plus beta-lactam combination therapy",
      "fidaxomicin oral vs oral vancomycin",
      "fecal microbiota spores (oral biotherapeutic)",
      "short-course vs traditional extended antibiotic duration",
      "echinocandin antifungal therapy (anidulafungin, caspofungin)",
      "single-tablet integrase inhibitor antiretroviral therapy"
    ],
    outcomesRanked: [
      "30-day all-cause mortality",
      "clinical cure at test-of-cure visit",
      "microbiological eradication / persistent bacteremia clearance",
      "sustained clinical response without recurrence at 8 weeks",
      "emergence of secondary antimicrobial resistance",
      "adverse drug events / acute kidney injury",
      "virological suppression (HIV RNA < 50 copies/mL)"
    ],
    terminology: ["IDSA", "ESCMID", "MRSA", "CRE", "CDI", "HAP", "VAP", "PK/PD", "MIC", "AMR"],
    presets: [
      {
        id: "cdi-fidaxomicin-vanc",
        name: "C. Difficile (Fidaxomicin vs Vancomycin)",
        description: "Adults with initial or recurrent Clostridioides difficile infection",
        p: "adults with initial or recurrent Clostridioides difficile infection",
        i: "oral fidaxomicin (standard or pulsed regimen)",
        c: "oral vancomycin 125 mg four times daily",
        o: "sustained clinical cure without recurrence at 30-90 days",
        raw: "Clostridioides difficile, fidaxomicin, vancomycin, clinical cure, recurrence rate"
      },
      {
        id: "cre-ceftazidime-avibactam",
        name: "CRE Infections (Ceftazidime-Avibactam vs Colistin)",
        description: "Hospitalized patients with confirmed carbapenem-resistant Enterobacterales bacteremia",
        p: "hospitalized adults with carbapenem-resistant Enterobacterales bacteremia",
        i: "ceftazidime-avibactam monotherapy",
        c: "colistin-based combination regimens",
        o: "30-day all-cause mortality and renal toxicity",
        raw: "carbapenem resistant enterobacterales, ceftazidime-avibactam, colistin, 30-day mortality, acute kidney injury"
      },
      {
        id: "mrsa-bacteremia-combination",
        name: "MRSA Bacteremia (Daptomycin + Ceftaroline vs Vancomycin)",
        description: "Adults with persistent or high-inoculum MRSA bacteremia",
        p: "adults with persistent MRSA bacteremia",
        i: "high-dose daptomycin plus ceftaroline combination",
        c: "standard vancomycin monotherapy",
        o: "time to bacteremia clearance and 30-day mortality",
        raw: "MRSA bacteremia, daptomycin, ceftaroline, vancomycin, blood culture clearance, mortality"
      }
    ],
    outcomeRules: [
      {
        keywords: ["bacteremia", "mrsa", "cre", "sepsis", "antimicrobial", "colistin"],
        primary: "30-day all-cause mortality and microbiological clearance",
        alternatives: ["clinical cure at test-of-cure", "acute kidney injury rate", "emergence of secondary resistance"],
        rationale: "Rapid bloodstream sterilization with survival without nephrotoxicity defines optimal antimicrobial management."
      },
      {
        keywords: ["cdi", "clostridioides", "difficile", "fidaxomicin", "vancomycin"],
        primary: "sustained clinical response without recurrence at 8 weeks",
        alternatives: ["initial clinical cure at day 14", "time to diarrhea resolution", "all-cause mortality"],
        rationale: "Preventing debilitating and costly recurrent CDI episodes is the definitive clinical endpoint."
      }
    ],
    systemPromptRole: "You are an expert infectious disease specialist, medical microbiologist, and clinical antimicrobial trialist specializing in Infectious Diseases and Global Health.",
    gapPromptRole: "You are an evidence-mapping engine for Infectious Diseases & Antimicrobial Stewardship with strict scientific editorial standards."
  },

  dermatology: {
    id: "dermatology",
    label: "Dermatology & Cutaneous Biology",
    shortName: "Dermatology",
    icon: "🧴",
    category: "Dermatology",
    description: "Immune-mediated skin diseases, psoriasis, atopic eczema, cutaneous oncology, and targeted biologics.",
    authorityGuidelines: "AAD · EADV · BAD · EDF",
    conditions: [
      "moderate-to-severe plaque psoriasis",
      "moderate-to-severe atopic dermatitis",
      "hidradenitis suppurativa (Hurley stage II-III)",
      "severe alopecia areata",
      "cutaneous malignant melanoma (early stage / in situ)",
      "generalized vitiligo",
      "bullous pemphigoid"
    ],
    interventions: [
      "IL-23 p19 inhibitors (guselkumab, risankizumab)",
      "IL-17A/F inhibitors (bimekizumab, secukinumab)",
      "oral and topical JAK inhibitors (upadacitinib, ruxolitinib)",
      "IL-4/IL-13 dual receptor antagonist (dupilumab)",
      "Mohs micrographic surgery vs wide local excision",
      "narrowband UVB phototherapy",
      "systemic methotrexate vs biologics"
    ],
    outcomesRanked: [
      "PASI 90 / PASI 100 clear skin response at 16 weeks",
      "EASI 75 / EASI 90 and validated Investigator Global Assessment (vIGA 0/1)",
      "peak pruritus numerical rating scale (PP-NRS >= 4-point reduction)",
      "hidradenitis suppurativa clinical response (HiSCR 50 / HiSCR 75)",
      "Dermatology Life Quality Index (DLQI 0/1 - no impact on life)",
      "local surgical recurrence rate at 5 years",
      "treatment-emergent serious adverse events"
    ],
    terminology: ["AAD", "EADV", "PASI", "EASI", "vIGA", "HiSCR", "DLQI", "PP-NRS", "IL-17", "IL-23"],
    presets: [
      {
        id: "psoriasis-il23-il17",
        name: "Plaque Psoriasis (IL-23 Inhibitors vs IL-17 Inhibitors)",
        description: "Adults with moderate-to-severe chronic plaque psoriasis",
        p: "moderate-to-severe chronic plaque psoriasis",
        i: "risankizumab (IL-23 p19 inhibitor)",
        c: "secukinumab (IL-17A inhibitor)",
        o: "PASI 90 and PASI 100 clear skin response at 52 weeks",
        raw: "plaque psoriasis, risankizumab, secukinumab, PASI 90, PASI 100, durable skin clearance"
      },
      {
        id: "atopic-derm-jak-biologic",
        name: "Atopic Dermatitis (Upadacitinib vs Dupilumab)",
        description: "Moderate-to-severe atopic dermatitis eligible for systemic therapy",
        p: "moderate-to-severe atopic dermatitis in adults",
        i: "oral upadacitinib 30 mg daily",
        c: "subcutaneous dupilumab 300 mg every 2 weeks",
        o: "EASI 75 and PP-NRS itch reduction at week 16",
        raw: "atopic dermatitis, upadacitinib, dupilumab, EASI 75, pruritus score, skin clearance"
      },
      {
        id: "hidradenitis-biologics",
        name: "Hidradenitis Suppurativa (Bimekizumab/Secukinumab vs Adalimumab)",
        description: "Moderate-to-severe hidradenitis suppurativa (Hurley stage II/III)",
        p: "moderate-to-severe active hidradenitis suppurativa",
        i: "secukinumab subcutaneous every 2 weeks",
        c: "adalimumab standard dosing",
        o: "HiSCR 50 clinical response and draining tunnel reduction at 16 weeks",
        raw: "hidradenitis suppurativa, secukinumab, adalimumab, HiSCR response, inflammatory lesions"
      }
    ],
    outcomeRules: [
      {
        keywords: ["psoriasis", "pasi", "plaque psoriasis", "skin clearance"],
        primary: "PASI 90 and PASI 100 clear skin response at 16-52 weeks",
        alternatives: ["sPGA 0/1 (clear or almost clear)", "DLQI 0/1 remission", "adverse events"],
        rationale: "Near-complete (PASI 90) or complete (PASI 100) cutaneous clearance is the benchmark for modern systemic therapy."
      },
      {
        keywords: ["atopic dermatitis", "eczema", "pruritus", "easi", "itch"],
        primary: "EASI 75 and rapid itch reduction (PP-NRS >= 4-point reduction)",
        alternatives: ["vIGA 0/1 clear skin", "EASI 90 response", "DLQI score improvement"],
        rationale: "Concurrent substantial lesion clearance and meaningful pruritus relief represent transformative patient benefit."
      }
    ],
    systemPromptRole: "You are an expert academic dermatologist, cutaneous immunologist, and dermatologic clinical trialist specializing in Dermatology and Cutaneous Biology.",
    gapPromptRole: "You are an evidence-mapping engine for Dermatology & Cutaneous Biology with strict scientific editorial standards."
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
  "Metabolic",
  "Emergency & Critical Care",
  "Psychiatry & Behavioral Health",
  "Orthopedics & Musculoskeletal",
  "Pulmonology & Respiratory",
  "Gastroenterology & Hepatology",
  "Infectious Diseases",
  "Dermatology"
] as const;

export function getSpecialtyDefinition(id: string): SpecialtyDefinition {
  if (id in SPECIALTIES) {
    return SPECIALTIES[id];
  }
  // Fallbacks for legacy keys
  if (id === "infertility" || id === "gynecology" || id === "obstetrics") {
    return SPECIALTIES.obgyn;
  }
  return SPECIALTIES.internal_med;
}
