import { KB, type SpecialtyKey } from "./kb.ts";

export interface ParsedClinicalScenario {
  specialty: SpecialtyKey;
  population: string;
  intervention: string;
  comparator: string;
  outcomes: string[];
  suggestedQuestions: Array<{ question: string; rationale: string }>;
}

export type OutcomeDirection = "adverse" | "desirable" | "neutral";

export interface OutcomeMetadata {
  label: string;
  direction: OutcomeDirection;
}

// Comprehensive clinical taxonomy for Obstetrics, Gynecology, and Infertility
interface MedicalTermEntry {
  canonical: string;
  category: "condition" | "intervention" | "comparator" | "outcome";
  specialty: SpecialtyKey;
  direction?: OutcomeDirection;
  synonyms: string[];
}

const MEDICAL_TAXONOMY: MedicalTermEntry[] = [
  // --- OBSTETRICS: Conditions ---
  {
    canonical: "short cervix",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["short cervix", "cervical length", "short cervical length", "cervical shortening", "transvaginal cervical length", "cervical length < 25 mm", "cervical length < 25mm"]
  },
  {
    canonical: "preterm birth risk",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["preterm labor", "preterm labour", "preterm delivery risk", "spontaneous preterm birth", "prior preterm birth", "preterm birth risk", "history of preterm birth"]
  },
  {
    canonical: "preeclampsia",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["pre-eclampsia", "eclampsia", "hypertensive disorder of pregnancy", "gestational hypertension", "preeclampsia", "preterm preeclampsia"]
  },
  {
    canonical: "gestational diabetes mellitus",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["gestational diabetes", "gdm", "hyperglycemia in pregnancy", "hyperglycaemia in pregnancy", "gestational diabetes mellitus"]
  },
  {
    canonical: "cervical insufficiency",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["cervical incompetence", "incompetent cervix", "cervical insufficiency", "cervical weakness"]
  },
  {
    canonical: "fetal growth restriction",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["intrauterine growth restriction", "fgr", "iugr", "small for gestational age", "sga", "fetal growth restriction", "growth restricted fetus"]
  },
  {
    canonical: "placenta previa",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["low-lying placenta", "placental previa", "placenta previa"]
  },
  {
    canonical: "placenta accreta spectrum",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["accreta", "increta", "percreta", "pas", "placenta accreta spectrum", "abnormally invasive placenta"]
  },
  {
    canonical: "preterm premature rupture of membranes",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["pprom", "premature rupture of membranes", "preterm premature rupture of membranes", "prom"]
  },
  {
    canonical: "twin pregnancy",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["multiple gestation", "twin gestation", "dichorionic twins", "monochorionic twins", "twin pregnancy", "multiple pregnancy"]
  },
  {
    canonical: "postpartum hemorrhage",
    category: "condition",
    specialty: "obstetrics",
    synonyms: ["post-partum hemorrhage", "pph", "obstetric hemorrhage", "postpartum hemorrhage", "uterine atony"]
  },

  // --- OBSTETRICS: Interventions / Comparators ---
  {
    canonical: "vaginal progesterone",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["vaginal progesterone", "progesterone", "micronized progesterone", "vaginal progesterone suppositories", "prometrium", "vaginal progesterone gel", "natural progesterone"]
  },
  {
    canonical: "cervical cerclage",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["cervical cerclage", "cerclage", "mcdonald cerclage", "shirodkar cerclage", "transabdominal cerclage", "emergency cerclage", "history-indicated cerclage"]
  },
  {
    canonical: "cervical pessary",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["cervical pessary", "pessary", "arabin pessary", "arabine pessary"]
  },
  {
    canonical: "low-dose aspirin",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["low-dose aspirin", "aspirin", "acetylsalicylic acid", "asa", "low dose aspirin", "baby aspirin"]
  },
  {
    canonical: "antenatal corticosteroids",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["antenatal corticosteroids", "corticosteroids", "betamethasone", "dexamethasone", "antenatal steroids", "steroid course"]
  },
  {
    canonical: "magnesium sulfate",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["magnesium sulfate", "magnesium sulphate", "mgso4", "neuroprotective magnesium", "intravenous magnesium"]
  },
  {
    canonical: "calcium supplementation",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["calcium supplementation", "calcium", "dietary calcium", "calcium carbonate"]
  },
  {
    canonical: "low molecular weight heparin",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["low molecular weight heparin", "lmwh", "enoxaparin", "dalteparin", "heparin"]
  },
  {
    canonical: "metformin",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["metformin", "glucophage"]
  },
  {
    canonical: "insulin therapy",
    category: "intervention",
    specialty: "obstetrics",
    synonyms: ["insulin", "insulin therapy", "basal insulin", "prandial insulin"]
  },

  // --- GYNECOLOGY: Conditions ---
  {
    canonical: "endometriosis",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["endometriosis", "endometrioma", "ovarian endometrioma", "deep infiltrating endometriosis", "peritoneal endometriosis", "die"]
  },
  {
    canonical: "uterine fibroids",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["uterine fibroids", "fibroids", "leiomyoma", "uterine leiomyoma", "myoma", "myomas"]
  },
  {
    canonical: "heavy menstrual bleeding",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["heavy menstrual bleeding", "menorrhagia", "abnormal uterine bleeding", "aub", "hmb", "excessive bleeding"]
  },
  {
    canonical: "adenomyosis",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["adenomyosis", "diffuse adenomyosis", "focal adenomyosis", "adenomyoma"]
  },
  {
    canonical: "chronic pelvic pain",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["chronic pelvic pain", "pelvic pain", "dysmenorrhea", "painful periods", "dyspareunia"]
  },
  {
    canonical: "endometrial hyperplasia",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["endometrial hyperplasia", "endometrial intraepithelial neoplasia", "ein", "atypical hyperplasia"]
  },
  {
    canonical: "pelvic organ prolapse",
    category: "condition",
    specialty: "gynecology",
    synonyms: ["pelvic organ prolapse", "prolapse", "cystocele", "rectocele", "uterine prolapse", "vaginal vault prolapse"]
  },

  // --- GYNECOLOGY: Interventions / Comparators ---
  {
    canonical: "laparoscopic surgery",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["laparoscopic surgery", "laparoscopy", "laparoscopic excision", "laparoscopic cystectomy", "laparoscopic ablation", "minimally invasive surgery"]
  },
  {
    canonical: "dienogest",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["dienogest", "visanne", "progestin therapy", "dienogest therapy"]
  },
  {
    canonical: "myomectomy",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["myomectomy", "laparoscopic myomectomy", "hysteroscopic myomectomy", "abdominal myomectomy"]
  },
  {
    canonical: "uterine artery embolization",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["uterine artery embolization", "uae", "ufe", "uterine fibroid embolization"]
  },
  {
    canonical: "levonorgestrel-releasing intrauterine system",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["levonorgestrel-releasing intrauterine system", "lng-ius", "mirena", "levonorgestrel ius", "progestin iud", "hormonal iud"]
  },
  {
    canonical: "tranexamic acid",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["tranexamic acid", "txa", "cyklokapron", "antifibrinolytic therapy"]
  },
  {
    canonical: "GnRH agonists",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["gnrh agonists", "leuprolide", "gnrh agonist", "goserelin", "zoladex", "lupron"]
  },
  {
    canonical: "GnRH antagonists",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["gnrh antagonists", "relugolix", "elagolix", "linzagolix", "gnrh antagonist"]
  },
  {
    canonical: "combined oral contraceptives",
    category: "intervention",
    specialty: "gynecology",
    synonyms: ["combined oral contraceptives", "coc", "birth control pill", "oral contraceptive pill", "ocp"]
  },

  // --- INFERTILITY: Conditions ---
  {
    canonical: "polycystic ovary syndrome",
    category: "condition",
    specialty: "infertility",
    synonyms: ["polycystic ovary syndrome", "pcos", "polycystic ovaries", "anovulatory infertility", "anovulation"]
  },
  {
    canonical: "unexplained infertility",
    category: "condition",
    specialty: "infertility",
    synonyms: ["unexplained infertility", "unexplained subfertility", "idiopathic infertility"]
  },
  {
    canonical: "recurrent implantation failure",
    category: "condition",
    specialty: "infertility",
    synonyms: ["recurrent implantation failure", "rif", "implantation failure", "recurrent failure"]
  },
  {
    canonical: "diminished ovarian reserve",
    category: "condition",
    specialty: "infertility",
    synonyms: ["diminished ovarian reserve", "dor", "low amh", "elevated fsh", "low antral follicle count", "decreased ovarian reserve"]
  },
  {
    canonical: "poor ovarian response",
    category: "condition",
    specialty: "infertility",
    synonyms: [
      "poor ovarian response", "poor responders", "poor responder",
      "poor ovarian responders", "low ovarian response", "por",
      "bologna criteria", "poseidon criteria", "poor ovarian reserve",
      "expected poor responders"
    ]
  },
  {
    canonical: "thin endometrium",
    category: "condition",
    specialty: "infertility",
    synonyms: ["thin endometrium", "refractory thin lining", "unresponsive endometrium", "thin endometrial lining"]
  },
  {
    canonical: "male factor infertility",
    category: "condition",
    specialty: "infertility",
    synonyms: ["male factor infertility", "oligozoospermia", "asthenozoospermia", "teratozoospermia", "azoospermia", "male subfertility"]
  },
  {
    canonical: "recurrent pregnancy loss",
    category: "condition",
    specialty: "infertility",
    synonyms: ["recurrent pregnancy loss", "rpl", "recurrent miscarriage", "habitual abortion"]
  },

  // --- INFERTILITY: Interventions / Comparators ---
  {
    canonical: "growth hormone",
    category: "intervention",
    specialty: "infertility",
    synonyms: [
      "growth hormone", "gh", "somatotropin", "growth hormone adjuvant",
      "gh co-treatment", "growth hormone supplementation", "growth hormone co-treatment",
      "adjuvant growth hormone"
    ]
  },
  {
    canonical: "coenzyme Q10",
    category: "intervention",
    specialty: "infertility",
    synonyms: [
      "coenzyme q10", "co enzyme q10", "co-enzyme q10", "coq10",
      "ubiquinol", "ubiquinone", "coenzyme q10 supplementation", "co enzyme q 10"
    ]
  },
  {
    canonical: "dehydroepiandrosterone",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["dehydroepiandrosterone", "dhea", "dhea supplementation", "dhea adjuvant"]
  },
  {
    canonical: "melatonin",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["melatonin", "melatonin supplementation", "melatonin adjuvant"]
  },
  {
    canonical: "myo-inositol",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["myo-inositol", "inositol", "myoinositol", "d-chiro-inositol"]
  },
  {
    canonical: "letrozole",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["letrozole", "femara", "aromatase inhibitor", "letrozole therapy"]
  },
  {
    canonical: "clomiphene citrate",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["clomiphene citrate", "clomid", "clomifene", "clomiphene"]
  },
  {
    canonical: "in vitro fertilization",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["in vitro fertilization", "ivf", "art", "assisted reproductive technology"]
  },
  {
    canonical: "intrauterine insemination",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["intrauterine insemination", "iui", "artificial insemination"]
  },
  {
    canonical: "intracytoplasmic sperm injection",
    category: "intervention",
    specialty: "infertility",
    synonyms: ["intracytoplasmic sperm injection", "icsi"]
  },

  // --- OUTCOMES ---
  {
    canonical: "spontaneous preterm birth before 34 weeks",
    category: "outcome",
    specialty: "obstetrics",
    direction: "adverse",
    synonyms: ["spontaneous preterm birth before 34 weeks", "preterm birth before 34 weeks", "preterm birth < 34 weeks", "preterm delivery", "early preterm birth", "delivery before 34 weeks", "preterm birth"]
  },
  {
    canonical: "gestational age at delivery",
    category: "outcome",
    specialty: "obstetrics",
    direction: "desirable",
    synonyms: ["gestational age at delivery", "gestational age", "gestation length", "prolongation of pregnancy"]
  },
  {
    canonical: "composite neonatal morbidity and mortality",
    category: "outcome",
    specialty: "obstetrics",
    direction: "adverse",
    synonyms: ["composite neonatal morbidity and mortality", "neonatal morbidity", "neonatal outcomes", "perinatal mortality", "nicu admission", "respiratory distress syndrome"]
  },
  {
    canonical: "cervical length maintenance",
    category: "outcome",
    specialty: "obstetrics",
    direction: "desirable",
    synonyms: ["cervical length maintenance", "cervical length", "prevention of cervical shortening", "cervical length stability"]
  },
  {
    canonical: "preterm preeclampsia rate",
    category: "outcome",
    specialty: "obstetrics",
    direction: "adverse",
    synonyms: ["preterm preeclampsia rate", "preterm preeclampsia", "early-onset preeclampsia", "preeclampsia incidence"]
  },
  {
    canonical: "pelvic pain reduction",
    category: "outcome",
    specialty: "gynecology",
    direction: "desirable",
    synonyms: ["pelvic pain reduction", "pelvic pain", "pain", "pain relief", "dysmenorrhea relief", "reduction in pelvic pain", "vas pain score", "pain reduction", "symptom relief"]
  },
  {
    canonical: "preservation of ovarian reserve",
    category: "outcome",
    specialty: "gynecology",
    direction: "desirable",
    synonyms: ["preservation of ovarian reserve", "ovarian reserve", "amh levels", "anti-mullerian hormone", "antral follicle count", "amh"]
  },
  {
    canonical: "menstrual blood loss reduction",
    category: "outcome",
    specialty: "gynecology",
    direction: "desirable",
    synonyms: ["menstrual blood loss reduction", "menstrual bleeding", "bleeding", "blood loss", "reduction in bleeding", "bleeding cessation", "hemoglobin level", "pictus score"]
  },
  {
    canonical: "health-related quality of life",
    category: "outcome",
    specialty: "gynecology",
    direction: "desirable",
    synonyms: ["health-related quality of life", "quality of life", "qol", "patient satisfaction", "ephq-30"]
  },
  {
    canonical: "disease recurrence rate",
    category: "outcome",
    specialty: "gynecology",
    direction: "adverse",
    synonyms: ["disease recurrence rate", "recurrence", "recurrent endometrioma", "repeat surgery", "reoperation rate"]
  },
  {
    canonical: "cumulative live birth rate",
    category: "outcome",
    specialty: "infertility",
    direction: "desirable",
    synonyms: ["cumulative live birth rate", "live birth rate", "live birth", "ongoing pregnancy rate"]
  },
  {
    canonical: "ovulation rate",
    category: "outcome",
    specialty: "infertility",
    direction: "desirable",
    synonyms: ["ovulation rate", "ovulation", "ovulatory cycles", "mono-ovulation rate"]
  },
  {
    canonical: "clinical pregnancy rate",
    category: "outcome",
    specialty: "infertility",
    direction: "desirable",
    synonyms: ["clinical pregnancy rate", "pregnancy rate", "implantation rate"]
  },
  {
    canonical: "miscarriage rate",
    category: "outcome",
    specialty: "infertility",
    direction: "adverse",
    synonyms: ["miscarriage rate", "miscarriage", "early pregnancy loss", "spontaneous abortion"]
  },
  {
    canonical: "oocyte yield",
    category: "outcome",
    specialty: "infertility",
    direction: "desirable",
    synonyms: ["oocyte yield", "number of oocytes retrieved", "retrieved oocytes", "mature oocytes", "mII oocytes", "metaphase II oocytes", "oocytes"]
  },
  {
    canonical: "fertilization rate",
    category: "outcome",
    specialty: "infertility",
    direction: "desirable",
    synonyms: ["fertilization rate", "fertilisation rate", "2pn rate", "normal fertilization rate"]
  },
  {
    canonical: "cycle cancellation rate",
    category: "outcome",
    specialty: "infertility",
    direction: "adverse",
    synonyms: ["cycle cancellation rate", "cycle cancellation", "cancellation rate"]
  },
  {
    canonical: "ovarian hyperstimulation syndrome",
    category: "outcome",
    specialty: "infertility",
    direction: "adverse",
    synonyms: ["ovarian hyperstimulation syndrome", "ohss", "severe ohss", "moderate to severe ohss"]
  },
  {
    canonical: "placebo",
    category: "comparator",
    specialty: "cardiology",
    synonyms: ["placebo", "matching placebo", "placebo control"]
  },

  // --- CARDIOLOGY ---
  {
    canonical: "heart failure with reduced ejection fraction",
    category: "condition",
    specialty: "cardiology",
    synonyms: ["heart failure", "hfref", "hfpef", "reduced ejection fraction", "heart failure reduced ejection fraction", "congestive heart failure"]
  },
  {
    canonical: "atrial fibrillation",
    category: "condition",
    specialty: "cardiology",
    synonyms: ["atrial fibrillation", "afib", "a-fib", "non-valvular atrial fibrillation"]
  },
  {
    canonical: "coronary artery disease",
    category: "condition",
    specialty: "cardiology",
    synonyms: ["coronary artery disease", "multivessel cad", "cad", "ischemic heart disease", "acute coronary syndrome"]
  },
  {
    canonical: "SGLT2 inhibitors",
    category: "intervention",
    specialty: "cardiology",
    synonyms: ["sglt2 inhibitor", "sglt2 inhibitors", "dapagliflozin", "empagliflozin", "sglt2i"]
  },
  {
    canonical: "direct oral anticoagulants",
    category: "intervention",
    specialty: "cardiology",
    synonyms: ["direct oral anticoagulants", "doac", "doacs", "apixaban", "rivaroxaban", "noac"]
  },
  {
    canonical: "percutaneous coronary intervention",
    category: "intervention",
    specialty: "cardiology",
    synonyms: ["percutaneous coronary intervention", "pci", "coronary stenting", "angioplasty"]
  },
  {
    canonical: "coronary artery bypass grafting",
    category: "comparator",
    specialty: "cardiology",
    synonyms: ["coronary artery bypass grafting", "cabg", "coronary bypass surgery", "surgical revascularization"]
  },
  {
    canonical: "cardiovascular death or heart failure hospitalization",
    category: "outcome",
    specialty: "cardiology",
    direction: "adverse",
    synonyms: ["cardiovascular death", "heart failure hospitalization", "cv death", "cv mortality", "hospitalization for heart failure"]
  },
  {
    canonical: "major adverse cardiovascular events",
    category: "outcome",
    specialty: "cardiology",
    direction: "adverse",
    synonyms: ["major adverse cardiovascular events", "mace", "macce", "stroke", "myocardial infarction", "cardiovascular death"]
  },

  // --- ONCOLOGY ---
  {
    canonical: "advanced non-small cell lung cancer",
    category: "condition",
    specialty: "oncology",
    synonyms: ["non-small cell lung cancer", "nsclc", "advanced nsclc", "metastatic lung cancer", "lung adenocarcinoma"]
  },
  {
    canonical: "metastatic breast cancer",
    category: "condition",
    specialty: "oncology",
    synonyms: ["metastatic breast cancer", "breast cancer", "her2-positive breast cancer", "triple-negative breast cancer", "tnbc"]
  },
  {
    canonical: "pembrolizumab",
    category: "intervention",
    specialty: "oncology",
    synonyms: ["pembrolizumab", "keytruda", "immune checkpoint inhibitor", "immunotherapy", "anti-pd-1"]
  },
  {
    canonical: "platinum chemotherapy",
    category: "comparator",
    specialty: "oncology",
    synonyms: ["platinum chemotherapy", "chemotherapy", "carboplatin", "cisplatin", "chemo"]
  },
  {
    canonical: "overall survival",
    category: "outcome",
    specialty: "oncology",
    direction: "desirable",
    synonyms: ["overall survival", "os", "median overall survival", "survival rate"]
  },
  {
    canonical: "progression-free survival",
    category: "outcome",
    specialty: "oncology",
    direction: "desirable",
    synonyms: ["progression-free survival", "pfs", "disease-free survival", "dfs"]
  },

  // --- PEDIATRICS ---
  {
    canonical: "neonatal respiratory distress syndrome",
    category: "condition",
    specialty: "pediatrics",
    synonyms: ["respiratory distress syndrome", "rds", "neonatal rds", "infant respiratory distress"]
  },
  {
    canonical: "acute bronchiolitis",
    category: "condition",
    specialty: "pediatrics",
    synonyms: ["acute bronchiolitis", "bronchiolitis", "infant bronchiolitis", "rsv bronchiolitis"]
  },
  {
    canonical: "high-flow nasal cannula",
    category: "intervention",
    specialty: "pediatrics",
    synonyms: ["high-flow nasal cannula", "hfnc", "high flow nasal oxygen", "heated humidified high-flow"]
  },
  {
    canonical: "continuous positive airway pressure",
    category: "intervention",
    specialty: "pediatrics",
    synonyms: ["continuous positive airway pressure", "cpap", "nasal cpap", "ncpap"]
  },
  {
    canonical: "bronchopulmonary dysplasia",
    category: "outcome",
    specialty: "pediatrics",
    direction: "adverse",
    synonyms: ["bronchopulmonary dysplasia", "bpd", "chronic lung disease of prematurity"]
  },

  // --- SURGERY ---
  {
    canonical: "acute appendicitis",
    category: "condition",
    specialty: "surgery",
    synonyms: ["acute appendicitis", "appendicitis", "uncomplicated appendicitis"]
  },
  {
    canonical: "acute cholecystitis",
    category: "condition",
    specialty: "surgery",
    synonyms: ["acute cholecystitis", "cholecystitis", "cholelithiasis", "gallstone disease"]
  },
  {
    canonical: "laparoscopic surgery",
    category: "intervention",
    specialty: "surgery",
    synonyms: ["laparoscopic appendectomy", "laparoscopic cholecystectomy", "minimally invasive surgery", "laparoscopy"]
  },
  {
    canonical: "surgical site infection",
    category: "outcome",
    specialty: "surgery",
    direction: "adverse",
    synonyms: ["surgical site infection", "ssi", "wound infection", "postoperative complications", "clavien-dindo"]
  },

  // --- NEUROLOGY ---
  {
    canonical: "acute ischemic stroke",
    category: "condition",
    specialty: "neurology",
    synonyms: ["acute ischemic stroke", "ischemic stroke", "large vessel occlusion", "stroke", "lvo"]
  },
  {
    canonical: "mechanical thrombectomy",
    category: "intervention",
    specialty: "neurology",
    synonyms: ["mechanical thrombectomy", "endovascular thrombectomy", "evt", "thrombectomy"]
  },
  {
    canonical: "intravenous thrombolysis",
    category: "comparator",
    specialty: "neurology",
    synonyms: ["intravenous thrombolysis", "alteplase", "tenecteplase", "iv tpa"]
  },
  {
    canonical: "functional independence (mRS 0-2)",
    category: "outcome",
    specialty: "neurology",
    direction: "desirable",
    synonyms: ["functional independence", "modified rankin scale", "mrs 0-2", "functional recovery"]
  },

  // --- INTERNAL MEDICINE & METABOLISM ---
  {
    canonical: "chronic kidney disease",
    category: "condition",
    specialty: "internal_med",
    synonyms: ["chronic kidney disease", "ckd", "diabetic kidney disease", "renal impairment"]
  },
  {
    canonical: "type 2 diabetes mellitus",
    category: "condition",
    specialty: "endocrinology",
    synonyms: ["type 2 diabetes", "t2d", "t2dm", "diabetes mellitus"]
  },
  {
    canonical: "obesity",
    category: "condition",
    specialty: "endocrinology",
    synonyms: ["obesity", "overweight", "excess body weight", "severe obesity"]
  },
  {
    canonical: "tirzepatide",
    category: "intervention",
    specialty: "endocrinology",
    synonyms: ["tirzepatide", "mounjaro", "zepbound", "glp-1 receptor agonist", "gip/glp-1"]
  },
  {
    canonical: "semaglutide",
    category: "comparator",
    specialty: "endocrinology",
    synonyms: ["semaglutide", "ozempic", "wegovy"]
  },
  {
    canonical: "percentage body weight loss",
    category: "outcome",
    specialty: "endocrinology",
    direction: "desirable",
    synonyms: ["body weight loss", "weight loss", "weight reduction", "percentage weight change"]
  },

  // --- EMERGENCY MEDICINE & CRITICAL CARE ---
  {
    canonical: "septic shock",
    category: "condition",
    specialty: "emergency_med",
    synonyms: ["septic shock", "severe sepsis", "refractory sepsis", "sepsis with hypotension"]
  },
  {
    canonical: "out-of-hospital cardiac arrest",
    category: "condition",
    specialty: "emergency_med",
    synonyms: ["out-of-hospital cardiac arrest", "ohca", "cardiac arrest", "cardiopulmonary arrest", "rosc"]
  },
  {
    canonical: "targeted temperature management",
    category: "intervention",
    specialty: "emergency_med",
    synonyms: ["targeted temperature management", "ttm", "therapeutic hypothermia", "temperature control"]
  },
  {
    canonical: "favorable neurological outcome (CPC 1-2)",
    category: "outcome",
    specialty: "emergency_med",
    direction: "desirable",
    synonyms: ["favorable neurological outcome", "cpc 1-2", "neurological recovery", "cerebral performance category"]
  },

  // --- PSYCHIATRY & BEHAVIORAL HEALTH ---
  {
    canonical: "major depressive disorder",
    category: "condition",
    specialty: "psychiatry",
    synonyms: ["major depressive disorder", "mdd", "unipolar depression", "clinical depression"]
  },
  {
    canonical: "treatment-resistant depression",
    category: "condition",
    specialty: "psychiatry",
    synonyms: ["treatment-resistant depression", "trd", "refractory depression", "treatment resistant mdd"]
  },
  {
    canonical: "esketamine nasal spray",
    category: "intervention",
    specialty: "psychiatry",
    synonyms: ["esketamine", "esketamine nasal spray", "spravato"]
  },
  {
    canonical: "clinical remission (MADRS <= 10)",
    category: "outcome",
    specialty: "psychiatry",
    direction: "desirable",
    synonyms: ["clinical remission", "madrs <= 10", "madrs remission", "depressive remission", "ham-d remission"]
  },

  // --- ORTHOPEDIC SURGERY & SPORTS MEDICINE ---
  {
    canonical: "knee osteoarthritis",
    category: "condition",
    specialty: "orthopedics",
    synonyms: ["knee osteoarthritis", "gonarthrosis", "end-stage knee oa", "osteoarthritis of the knee"]
  },
  {
    canonical: "anterior cruciate ligament rupture",
    category: "condition",
    specialty: "orthopedics",
    synonyms: ["anterior cruciate ligament rupture", "acl tear", "acl rupture", "acute acl injury"]
  },
  {
    canonical: "robotic-assisted total knee arthroplasty",
    category: "intervention",
    specialty: "orthopedics",
    synonyms: ["robotic total knee arthroplasty", "robotic tka", "robotic-assisted arthroplasty", "mako tka"]
  },
  {
    canonical: "conventional manual total knee arthroplasty",
    category: "comparator",
    specialty: "orthopedics",
    synonyms: ["conventional manual total knee arthroplasty", "manual tka", "standard tka"]
  },
  {
    canonical: "implant survivorship and revision rate",
    category: "outcome",
    specialty: "orthopedics",
    direction: "desirable",
    synonyms: ["implant survivorship", "revision rate", "prosthetic survivorship", "revision surgery", "koos score"]
  },

  // --- PULMONOLOGY & RESPIRATORY MEDICINE ---
  {
    canonical: "chronic obstructive pulmonary disease",
    category: "condition",
    specialty: "pulmonology",
    synonyms: ["chronic obstructive pulmonary disease", "copd", "copd exacerbation", "chronic bronchitis", "emphysema"]
  },
  {
    canonical: "idiopathic pulmonary fibrosis",
    category: "condition",
    specialty: "pulmonology",
    synonyms: ["idiopathic pulmonary fibrosis", "ipf", "pulmonary fibrosis", "interstitial lung disease"]
  },
  {
    canonical: "triple inhaled therapy (ICS/LABA/LAMA)",
    category: "intervention",
    specialty: "pulmonology",
    synonyms: ["triple inhaled therapy", "ics/laba/lama", "single-inhaler triple therapy", "trelegy", "breztri"]
  },
  {
    canonical: "annualized exacerbation rate",
    category: "outcome",
    specialty: "pulmonology",
    direction: "adverse",
    synonyms: ["annualized exacerbation rate", "copd exacerbations", "asthma exacerbation rate", "severe exacerbation"]
  },

  // --- GASTROENTEROLOGY & HEPATOLOGY ---
  {
    canonical: "Crohn's disease",
    category: "condition",
    specialty: "gastroenterology",
    synonyms: ["crohn's disease", "crohn disease", "crohn", "inflammatory bowel disease", "ibd"]
  },
  {
    canonical: "metabolic dysfunction-associated steatohepatitis",
    category: "condition",
    specialty: "gastroenterology",
    synonyms: ["mash", "nash", "steatohepatitis", "metabolic steatohepatitis", "nonalcoholic steatohepatitis"]
  },
  {
    canonical: "risankizumab",
    category: "intervention",
    specialty: "gastroenterology",
    synonyms: ["risankizumab", "skyrizi", "il-23 inhibitor", "il-23 p19"]
  },
  {
    canonical: "endoscopic mucosal healing",
    category: "outcome",
    specialty: "gastroenterology",
    direction: "desirable",
    synonyms: ["endoscopic mucosal healing", "mucosal healing", "endoscopic remission", "ses-cd remission"]
  },

  // --- INFECTIOUS DISEASES & ANTIMICROBIAL STEWARDSHIP ---
  {
    canonical: "Clostridioides difficile infection",
    category: "condition",
    specialty: "infectious_disease",
    synonyms: ["clostridioides difficile", "c. difficile", "cdi", "clostridium difficile", "c diff"]
  },
  {
    canonical: "MRSA bacteremia",
    category: "condition",
    specialty: "infectious_disease",
    synonyms: ["mrsa bacteremia", "methicillin-resistant staphylococcus aureus bacteremia", "staphylococcus aureus bacteremia"]
  },
  {
    canonical: "fidaxomicin",
    category: "intervention",
    specialty: "infectious_disease",
    synonyms: ["fidaxomicin", "dificid", "dificlir"]
  },
  {
    canonical: "sustained clinical cure without recurrence",
    category: "outcome",
    specialty: "infectious_disease",
    direction: "desirable",
    synonyms: ["sustained clinical cure", "sustained cure", "recurrence-free survival", "cure without recurrence"]
  },

  // --- DERMATOLOGY & CUTANEOUS BIOLOGY ---
  {
    canonical: "chronic plaque psoriasis",
    category: "condition",
    specialty: "dermatology",
    synonyms: ["plaque psoriasis", "psoriasis vulgaris", "moderate-to-severe psoriasis", "psoriasis"]
  },
  {
    canonical: "atopic dermatitis",
    category: "condition",
    specialty: "dermatology",
    synonyms: ["atopic dermatitis", "atopic eczema", "severe eczema"]
  },
  {
    canonical: "upadacitinib",
    category: "intervention",
    specialty: "dermatology",
    synonyms: ["upadacitinib", "rinvoq", "oral jak inhibitor"]
  },
  {
    canonical: "PASI 90 clear skin response",
    category: "outcome",
    specialty: "dermatology",
    direction: "desirable",
    synonyms: ["pasi 90", "pasi 100", "pasi response", "clear skin response", "easi 75"]
  }
];

function cleanTokenString(s: string): string {
  return s.trim().replace(/^[\s,;:-]+|[\s,;:-]+$/g, "").replace(/\s+/g, " ");
}

/**
 * Determine whether an outcome represents an adverse event (to reduce/prevent)
 * or a desirable outcome (to improve/increase/preserve).
 */
export function getOutcomeDirection(outcomeText: string): OutcomeDirection {
  const lower = outcomeText.toLowerCase();
  const found = MEDICAL_TAXONOMY.find(
    m => m.category === "outcome" && (m.canonical.toLowerCase() === lower || m.synonyms.some(s => s.toLowerCase() === lower))
  );
  if (found?.direction) return found.direction;

  if (
    /mortality|morbidity|loss|miscarriage|preterm birth|complication|recurrence|adverse|admission|failure|death|bleeding|pain|cesarean|nicu|hospitali[sz]ation|readmission|exacerbation|relapse|events?\b|infection|stroke|infarction|thrombo|embolism|fracture|amputation|toxicity|hypoglyc|rejection|progression|incidence|injury|delirium|sepsis|mace\b|harm|decline|deterioration|worsening|risk\b/i.test(lower) &&
    !/relief|reduction|cessation|preservation|maintenance|quality|survival|free\b|remission|response|cure|healing|clearance|success|weight loss|body weight|independence|favou?rable/i.test(lower)
  ) {
    return "adverse";
  }
  return "desirable";
}

/**
 * "does" or "do" for a question whose subject is the intervention: "do SGLT2 inhibitors",
 * "does dapagliflozin". Plural when the head noun ends in a plural "s" (not -ss/-us/-is/-sis).
 */
export function auxVerbFor(intervention: string): "does" | "do" {
  const head = String(intervention || "").trim().split(/\s+(?:plus|with|and|combined|or)\s+/i)[0];
  const words = head.split(/\s+/).filter(Boolean);
  const last = (words[words.length - 1] || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (/\b(?:and|plus)\b/i.test(intervention) && !/combined/i.test(intervention)) return "do";
  if (last.length > 3 && /s$/.test(last) && !/(?:ss|us|is|sis|ics)$/.test(last)) return "do";
  if (/(?:inhibitors|blockers|agonists|antagonists|antibiotics|statins|steroids|corticosteroids|supplements|vaccines|interventions|therapies|drugs)$/.test(last)) return "do";
  return "does";
}

/** "reduce" for an adverse outcome (death, hospitalization), "improve" for a desirable one. */
export function outcomeVerbFor(outcome: string): "reduce" | "improve" {
  return getOutcomeDirection(outcome) === "adverse" ? "reduce" : "improve";
}

/** Drug-name endings and treatment words that mark a tag as an intervention, never an outcome. */
const INTERVENTION_WORD = /(?:gliflozin|glutide|gliptin|tirzepatide|statin|pril|sartan|olol|dipine|xaban|gatran|parin|mab|nib|tinib|ciclib|lisib|platin|taxel|rubicin|azole|mycin|micin|cillin|cef\w+|penem|floxacin|cycline|vir|lukast|terol|tropium|sonide|olone|prazole|setron|tidine|triptan|tiapine|peridone|oxetine|pramine|faxine|zepam|zolam|semide|thiazide|actone|teplase|alteplase|umab|kinra)\b|\b(?:placebo|vaccin\w*|inhibitors?|blockers?|agonists?|antagonists?|stent\w*|infusion|injection|tablets?|capsules?|regimen|dosing|supplementation|antibiotics?|antimicrobials?|surfactant|cpap|laba|lama|ics|hypothermia|cooling|appendectomy|cholecystectomy|ectomy|plasty|transplant\w*|ablation|radiotherapy|chemotherapy|immunotherapy|psychotherapy|cbt|rtms|tms|ect|rehabilitation|physiotherapy|exercise training|mechanical ventilation|ventilation)\b/i;

/** Tags that name an endpoint: checked before the broad "treatment|therapy" intervention rule. */
const OUTCOME_WORD = /\b(?:treatment failure|therapeutic failure|failure rate|rate|risk|score|survival|mortality|death|recurrence|relapse|remission|response|cure|clearance|healing|complications?|events?|exacerbations?|readmission|hospitali[sz]ation|decline|progression|incidence|quality of life|function|independence|length of stay|pain|bleeding|loss)\b/i;

/** Comparator-type tags: these are the "C" when present, whatever order the tags were typed in. */
const COMPARATOR_WORD = /\b(?:placebo|sham|standard(?:\s+of)?\s+care|usual\s+care|no\s+treatment|conservative|expectant|observation|watchful|control\s+group|best\s+supportive)\b/i;

/** Specific agents that belong to a drug class, so "dapagliflozin" is not set against "SGLT2 inhibitors". */
const DRUG_CLASSES: Array<[RegExp, RegExp]> = [
  [/sglt-?2/i, /gliflozin/i],
  [/glp-?1/i, /glutide|tirzepatide/i],
  [/dpp-?4/i, /gliptin/i],
  [/statin/i, /statin/i],
  [/ace\s*inhibitor/i, /pril\b/i],
  [/\barb\b|angiotensin receptor/i, /sartan/i],
  [/beta[-\s]?blocker/i, /olol\b/i],
  [/doac|anticoagul/i, /xaban|gatran/i],
  [/ppi|proton pump/i, /prazole/i],
  [/jak/i, /citinib|tinib/i],
  [/pd-?1|checkpoint/i, /lizumab|limab/i],
  [/ssri/i, /oxetine|aloprame|traline/i],
  [/temperature management|\bttm\b/i, /hypothermia|cooling/i]
];

function sameDrugClass(a: string, b: string): boolean {
  return DRUG_CLASSES.some(([cls, agent]) => (cls.test(a) && agent.test(b)) || (cls.test(b) && agent.test(a)));
}

/**
 * Formulate a clinically grammatical verb phrase for an outcome.
 */
function formulateOutcomeVerbPhrase(verbType: "primary" | "secondary" | "subgroup", outcome: string): string {
  const dir = getOutcomeDirection(outcome);
  const cleanOutcome = outcome.trim();

  // If the outcome already contains active action nouns
  if (/^reduction in /i.test(cleanOutcome) || / reduction$/i.test(cleanOutcome)) {
    return verbType === "primary" ? `achieve greater ${cleanOutcome}` : `lead to significant ${cleanOutcome}`;
  }
  if (/^preservation of /i.test(cleanOutcome) || / preservation$/i.test(cleanOutcome)) {
    return verbType === "primary" ? `enhance ${cleanOutcome}` : `ensure optimal ${cleanOutcome}`;
  }
  if (/^prevention of /i.test(cleanOutcome) || / prevention$/i.test(cleanOutcome)) {
    return verbType === "primary" ? `improve ${cleanOutcome}` : `support ${cleanOutcome}`;
  }

  if (/rate$/i.test(cleanOutcome)) {
    const base = cleanOutcome.replace(/\s+rate$/i, "");
    if (dir === "adverse") {
      switch (verbType) {
        case "primary":
          return `reduce the rate of ${base}`;
        case "secondary":
          return `decrease the incidence of ${base}`;
        case "subgroup":
          return `prevent ${base}`;
      }
    } else {
      switch (verbType) {
        case "primary":
          return `improve the ${cleanOutcome}`;
        case "secondary":
          return `increase the ${cleanOutcome}`;
        case "subgroup":
          return `improve the ${cleanOutcome}`;
      }
    }
  }

  if (dir === "adverse") {
    // "Reduce the risk of all-cause mortality" and "decrease the incidence of eGFR decline" are not
    // how these endpoints are written; rates, scores, declines and mortality are reduced directly.
    if (/mortality|death|decline|deterioration|worsening|risk|score|rate|length of stay|duration|pain/i.test(cleanOutcome)) {
      return verbType === "subgroup" && /decline|deterioration|progression/i.test(cleanOutcome)
        ? `slow ${cleanOutcome}`
        : `reduce ${cleanOutcome}`;
    }
    switch (verbType) {
      case "primary":
        return `reduce the risk of ${cleanOutcome}`;
      case "secondary":
        return `decrease the incidence of ${cleanOutcome}`;
      case "subgroup":
        return `prevent ${cleanOutcome}`;
    }
  } else {
    switch (verbType) {
      case "primary":
        return `improve ${cleanOutcome}`;
      case "secondary":
        return `increase ${cleanOutcome}`;
      case "subgroup":
        return `improve ${cleanOutcome}`;
    }
  }
}

/**
 * Formulate clinical population noun phrase (e.g. "women with endometriosis", "pregnant women with short cervix")
 */
export function formulatePopulationPhrase(population: string, specialty?: SpecialtyKey | null): string {
  const p = (population || "").trim();
  const lower = p.toLowerCase();

  if (/^(women|patients|adults|individuals|pregnant individuals|pregnant women|couples|infants|children)/i.test(lower)) {
    return p;
  }
  // The population already names people ("preterm infants", "older adults"): do not wrap it in
  // "pediatric patients with preterm infants".
  if (/\b(infants?|neonates?|newborns?|children|adolescents|women|men|adults|patients|individuals|people|survivors|recipients|smokers|athletes)\b/i.test(lower)) {
    return p;
  }
  if (/undergoing\s+(ivf|icsi|art|assisted reproductive|iui)/i.test(lower)) {
    if (/^poor\s+(ovarian\s+)?responders?/i.test(p)) {
      return p;
    }
    return `women with ${p}`;
  }
  if (/^poor\s+(ovarian\s+)?responders?$/i.test(lower)) {
    return `poor responders undergoing IVF`;
  }
  if (specialty === "obstetrics") {
    if (/pregnancy|twin|gestation|gravida|labor|labour/i.test(lower)) {
      return `pregnant women with ${p}`;
    }
    return `pregnant women diagnosed with ${p}`;
  }
  if (specialty === "infertility") {
    if (/infertil|response|reserve|failure|loss|pcos|azoospermia|oligozoospermia/i.test(lower)) {
      return `women with ${p}`;
    }
    return `women presenting with ${p}`;
  }
  if (specialty === "pediatrics") {
    return `pediatric patients with ${p}`;
  }
  if (specialty === "surgery") {
    return `patients presenting with ${p}`;
  }
  if (specialty === "gynecology") {
    return `women with ${p}`;
  }
  // Universal clinical medicine default across all specialties
  return `patients with ${p}`;
}

/**
 * Parses 4–12 clinical tag words into distinct, non-overlapping PICO roles:
 * - Population / Clinical Problem (P)
 * - Intervention (I)
 * - Comparator (C)
 * - Candidate Outcomes (O)
 */
export function parseClinicalScenario(rawInput: string, explicitSpecialty?: SpecialtyKey | null): ParsedClinicalScenario {
  const cleanInput = (rawInput || "").trim();
  // Split input by commas, semicolons, dashes, or newlines
  const rawTokens = cleanInput
    .split(/[,;\n\r]+/)
    .map(cleanTokenString)
    .filter(t => t.length > 1);

  const matchedConditions: string[] = [];
  const matchedInterventions: string[] = [];
  const matchedOutcomes: string[] = [];
  const specialtyScores: Record<SpecialtyKey, number> = {
    obstetrics: 0,
    gynecology: 0,
    infertility: 0,
    obgyn: 0,
    cardiology: 0,
    pediatrics: 0,
    oncology: 0,
    surgery: 0,
    internal_med: 0,
    neurology: 0,
    endocrinology: 0,
    emergency_med: 0,
    psychiatry: 0,
    orthopedics: 0,
    pulmonology: 0,
    gastroenterology: 0,
    infectious_disease: 0,
    dermatology: 0
  };

  if (explicitSpecialty && explicitSpecialty in specialtyScores) {
    specialtyScores[explicitSpecialty] += 3;
  }

  const unclassified: string[] = [];
  // Where each term came from: its position among the typed tags (so "I" and "C" follow the order
  // the clinician typed them), the raw tag text, and the taxonomy specialty it was matched under.
  const termMeta = new Map<string, { pos: number; raw: string; specialty?: SpecialtyKey }>();
  let tokenPos = -1;

  for (const token of rawTokens) {
    tokenPos++;
    const lower = token.toLowerCase();
    let found = false;

    // Sort taxonomy so that if condition is already identified, outcome and intervention take precedence
    const sortedTaxonomy = [...MEDICAL_TAXONOMY].sort((a, b) => {
      if (matchedConditions.length > 0) {
        if (a.category === "condition" && b.category !== "condition") return 1;
        if (b.category === "condition" && a.category !== "condition") return -1;
      }
      return 0;
    });

    for (const entry of sortedTaxonomy) {
      const isMatch = entry.synonyms.some(syn => {
        const s = syn.toLowerCase();
        // Exact match or full token match
        return lower === s || lower === s + "s" || (lower.length >= 4 && s === lower);
      });

      if (isMatch) {
        specialtyScores[entry.specialty] += 2;
        if (entry.category === "condition" && !matchedConditions.includes(entry.canonical)) {
          matchedConditions.push(entry.canonical);
          termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
          found = true;
          break;
        } else if ((entry.category === "intervention" || entry.category === "comparator") && !matchedInterventions.includes(entry.canonical)) {
          matchedInterventions.push(entry.canonical);
          termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
          found = true;
          break;
        } else if (entry.category === "outcome" && !matchedOutcomes.includes(entry.canonical)) {
          matchedOutcomes.push(entry.canonical);
          termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Secondary check: substring match on longer tokens
      for (const entry of sortedTaxonomy) {
        if (found) break;
        const isSubstring = entry.synonyms.some(syn => {
          const s = syn.toLowerCase();
          return (lower.length > 5 && s.includes(lower)) || (s.length > 5 && lower.includes(s));
        });
        if (isSubstring) {
          specialtyScores[entry.specialty] += 1;
          // A loose substring hit must not turn a typed drug or procedure into an outcome
          // ("antibiotics" inside an antibiotic-related endpoint name).
          if (entry.category === "outcome" && INTERVENTION_WORD.test(lower) && !OUTCOME_WORD.test(lower)) continue;
          if (entry.category === "condition" && !matchedConditions.includes(entry.canonical)) {
            matchedConditions.push(entry.canonical);
            termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
            found = true;
          } else if ((entry.category === "intervention" || entry.category === "comparator") && !matchedInterventions.includes(entry.canonical)) {
            matchedInterventions.push(entry.canonical);
            termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
            found = true;
          } else if (entry.category === "outcome" && !matchedOutcomes.includes(entry.canonical)) {
            matchedOutcomes.push(entry.canonical);
            termMeta.set(entry.canonical, { pos: tokenPos, raw: token, specialty: entry.specialty });
            found = true;
          }
        }
      }
    }

    if (!found) {
      unclassified.push(token);
    }
  }

  // Heuristic classification for any remaining tokens
  for (const token of unclassified) {
    const lower = token.toLowerCase();
    termMeta.set(token, { pos: rawTokens.indexOf(token), raw: token });
    // Interventions check first so procedures/drugs/hormones never contaminate Condition
    if (COMPARATOR_WORD.test(lower) || (INTERVENTION_WORD.test(lower) && !OUTCOME_WORD.test(lower))) {
      if (!matchedInterventions.includes(token)) matchedInterventions.push(token);
    } else if (OUTCOME_WORD.test(lower) && !/\b(?:disease|syndrome|cancer|carcinoma|infection)\b/i.test(lower) && !/heart failure|kidney failure|renal failure|respiratory failure|liver failure|ovarian failure/i.test(lower)) {
      if (!matchedOutcomes.includes(token)) matchedOutcomes.push(token);
    } else if (/hormone|coq10|coenzyme|dhea|melatonin|inositol|somatotropin|antioxidant|priming|supplements?|adjuvant|stimulat/i.test(lower)) {
      if (!matchedInterventions.includes(token)) matchedInterventions.push(token);
      specialtyScores.infertility += 2;
    } else if (/ectomy|scopy|surgery|treatment|therapy|drug|aspirin|progesterone|letrozole|clomiphene|cerclage|pessary|insulin|metformin|heparin|dienogest|embolization|ablation|insemination|transfer|sglt2|doac|thrombectomy|stent|bypass|thrombolysis|pembrolizumab|tirzepatide|semaglutide|esketamine|rtms|ect|cbt|tka|tha|acl|arthroplasty|nintedanib|pirfenidone|dupilumab|risankizumab|resmetirom|tips|fidaxomicin|ceftazidime|daptomycin|upadacitinib|secukinumab|phototherapy/i.test(lower)) {
      if (!matchedInterventions.includes(token)) matchedInterventions.push(token);
    } else if (/rate|relief|pain|birth|loss|bleeding|weight|score|morbidity|mortality|survival|gestational age|reserve|pregnancy|outcome|yield|mace|infection|hospitalization/i.test(lower)) {
      if (!matchedOutcomes.includes(token)) matchedOutcomes.push(token);
    } else if (/poor\s+responder|low\s+responder|itis|osis|emia|oma|syndrome|disease|preterm|preeclamp|diabetes|cervix|uterus|ovary|ovarian|fibroid|polyps|prolapse|failure|incompetence|restriction|stroke|infarction|cancer|carcinoma|appendicitis|cholecystitis|hernia|septic shock|cardiac arrest|ohca|resuscitation|depress|mdd|trd|bipolar|schizophr|osteoarthr|gonarthr|knee|hip|rotator|copd|fibrosis|ipf|asthma|crohn|colitis|ibd|mash|nash|cirrhosis|pancreat|bacteremia|mrsa|cdi|difficile|psoriasis|dermatitis|eczema|hidradenitis/i.test(lower)) {
      if (!matchedConditions.includes(token)) matchedConditions.push(token);
      if (/preterm|cervix|preeclamp|gestation/i.test(lower)) specialtyScores.obstetrics += 2;
      else if (/ivf|icsi|infertil|pcos|responder/i.test(lower)) specialtyScores.infertility += 2;
      else if (/stroke|thrombectomy/i.test(lower)) specialtyScores.neurology += 2;
      else if (/heart|cardio|infarction/i.test(lower)) specialtyScores.cardiology += 2;
      else if (/cancer|carcinoma|nsclc|tumor/i.test(lower)) specialtyScores.oncology += 2;
      else if (/appendic|cholecyst|hernia/i.test(lower)) specialtyScores.surgery += 2;
      else if (/septic\s*shock|cardiac\s*arrest|ohca|resuscitation/i.test(lower)) specialtyScores.emergency_med += 2;
      else if (/depress|mdd|trd|bipolar|schizophr|psych/i.test(lower)) specialtyScores.psychiatry += 2;
      else if (/osteoarthr|gonarthr|knee|hip|arthroplasty|acl|rotator/i.test(lower)) specialtyScores.orthopedics += 2;
      else if (/copd|ipf|fibrosis|asthma|bronch/i.test(lower)) specialtyScores.pulmonology += 2;
      else if (/crohn|colitis|ibd|mash|nash|cirrhosis|pancreat/i.test(lower)) specialtyScores.gastroenterology += 2;
      else if (/bacteremia|mrsa|cdi|difficile|antimicrobial/i.test(lower)) specialtyScores.infectious_disease += 2;
      else if (/psoriasis|dermatitis|eczema|hidradenitis|pasi/i.test(lower)) specialtyScores.dermatology += 2;
      else if (/kidney|nephr|ckd/i.test(lower)) specialtyScores.internal_med += 2;
      else if (/uter|pelvic|fibroid|menstru/i.test(lower)) specialtyScores.gynecology += 2;
    } else if (matchedConditions.length === 0) {
      matchedConditions.push(token);
    } else if (matchedInterventions.length < 2) {
      matchedInterventions.push(token);
    } else {
      matchedOutcomes.push(token);
    }
  }

  // Interventions in the order they were typed: the first typed arm is "I", the next is "C".
  const posOf = (t: string) => termMeta.get(t)?.pos ?? 999;
  matchedInterventions.sort((a, b) => posOf(a) - posOf(b));
  matchedOutcomes.sort((a, b) => posOf(a) - posOf(b));

  // In reproductive medicine: if an ART procedure (IVF / ICSI) is present alongside an underlying condition
  // (e.g. poor ovarian response, diminished ovarian reserve, PCOS) and adjuvant therapies (e.g. growth hormone, CoQ10),
  // IVF represents the clinical procedural setting of the population, not the test intervention competing with the adjuvant.
  const hasArtProcedure = matchedInterventions.some(i => /in vitro fertilization|intracytoplasmic sperm injection|ivf|icsi/i.test(i))
    || rawTokens.some(t => /\b(ivf|icsi|art)\b/i.test(t));
  const otherInterventions = matchedInterventions.filter(i => !/in vitro fertilization|intracytoplasmic sperm injection|ivf|icsi/i.test(i));

  if (hasArtProcedure && otherInterventions.length >= 1) {
    if (matchedConditions.length > 0) {
      if (!/ivf|icsi|in vitro|art/i.test(matchedConditions[0])) {
        matchedConditions[0] = `${matchedConditions[0]} undergoing IVF`;
      }
    } else {
      matchedConditions.push("women undergoing IVF");
    }
    // Retain only specific drug/adjuvant therapies as interventions
    matchedInterventions.length = 0;
    matchedInterventions.push(...otherInterventions);
    specialtyScores.infertility += 4;
  } else if (hasArtProcedure && matchedConditions.length === 0) {
    matchedConditions.push("women undergoing IVF");
  }

  // Determine specialty across all universal medical domains
  let specialty: SpecialtyKey = explicitSpecialty && explicitSpecialty in KB ? explicitSpecialty : "internal_med";

  const allSpecialties = Object.keys(specialtyScores) as SpecialtyKey[];
  const highestSpecialty = allSpecialties.reduce((best, cur) => specialtyScores[cur] > specialtyScores[best] ? cur : best, allSpecialties[0]);

  if (specialtyScores[highestSpecialty] > 0) {
    specialty = highestSpecialty;
  } else if (explicitSpecialty && explicitSpecialty in KB) {
    specialty = explicitSpecialty;
  }

  // Keep the clinician's own wording when the taxonomy term is less specific than what was typed
  // ("laparoscopic appendectomy", not "laparoscopic surgery"), and never let a term matched under a
  // different specialty bring that specialty's scale into this question ("clinical remission" in
  // Crohn's disease must not become "clinical remission (MADRS <= 10)").
  const localize = (term: string, kind: "intervention" | "outcome"): string => {
    const meta = termMeta.get(term);
    if (!meta || meta.raw === term) return term;
    const raw = meta.raw.trim();
    if (kind === "outcome" && meta.specialty && meta.specialty !== specialty && !(specialty === "obgyn" && /obstetrics|gynecology|infertility/.test(meta.specialty))) return raw;
    const hasAbbrev = /\b[A-Z0-9]{2,6}\b/.test(raw);
    const canonWords = new Set(term.toLowerCase().split(/[^a-z0-9]+/));
    const canonFlat = term.toLowerCase().replace(/[^a-z0-9]/g, "");
    // A word adds specificity only if it is not a spelling variant of the canonical term
    // ("laparoscopy" for "laparoscopic surgery", "co enzyme" for "coenzyme").
    const extra = raw.toLowerCase().split(/[^a-z0-9]+/).filter(w =>
      w.length >= 5 && !canonWords.has(w) && !canonFlat.includes(w) &&
      ![...canonWords].some(c => c.length >= 5 && c.slice(0, 6) === w.slice(0, 6)));
    if (kind === "intervention" && !hasAbbrev && extra.length > 0) return raw;
    return term;
  };
  for (let i = 0; i < matchedInterventions.length; i++) matchedInterventions[i] = localize(matchedInterventions[i], "intervention");
  for (let i = 0; i < matchedOutcomes.length; i++) matchedOutcomes[i] = localize(matchedOutcomes[i], "outcome");

  // A typed qualifier that describes the population ("large vessel occlusion" for ischemic stroke)
  // belongs to P, not to O.
  const populationQualifiers = matchedOutcomes.filter(o => /occlusion|stenosis|lesion|phenotype|subtype|mutation|positive|negative\b/i.test(o) && !OUTCOME_WORD.test(o));
  for (const q of populationQualifiers) matchedOutcomes.splice(matchedOutcomes.indexOf(q), 1);

  // Determine clean, non-overlapping P, I, C using dynamic knowledge base definitions
  const basePopulation = matchedConditions[0] || (KB[specialty]?.conditions?.[0] || "target clinical condition");
  const qualifier = populationQualifiers.find(q => !basePopulation.toLowerCase().includes(q.toLowerCase()));
  const population = qualifier ? `${basePopulation} with ${qualifier}` : basePopulation;
  
  let intervention = "";
  let comparator = "";

  // A comparator-type tag (placebo, standard care, sham...) is the comparator wherever it was typed,
  // and a specific agent of the intervention's own class ("dapagliflozin" for "SGLT2 inhibitors")
  // is not a comparator at all.
  const compIdx = matchedInterventions.findIndex(t => COMPARATOR_WORD.test(t));
  const activeArms = matchedInterventions.filter((_, i) => i !== compIdx);
  const distinctArms = activeArms.filter((t, i) => !activeArms.slice(0, i).some(prev => sameDrugClass(prev, t)));
  if (compIdx >= 0 && distinctArms.length >= 1) {
    intervention = distinctArms[0];
    comparator = matchedInterventions[compIdx];
  } else if (distinctArms.length >= 2) {
    intervention = distinctArms[0];
    comparator = distinctArms[1];
  } else if (distinctArms.length === 1 && compIdx < 0 && matchedInterventions.length >= 1) {
    intervention = distinctArms[0];
    comparator = specialty === "obstetrics" ? "standard care or expectant management" : "placebo or standard care";
  } else if (matchedInterventions.length >= 2) {
    intervention = matchedInterventions[0];
    comparator = matchedInterventions[1];
  } else if (matchedInterventions.length === 1) {
    intervention = matchedInterventions[0];
    comparator = specialty === "obstetrics" ? "standard care or expectant management" : "placebo or standard care";
  } else {
    const specDefault = KB[specialty] || KB.internal_med;
    intervention = specDefault.interventions[0] || "first-line therapy";
    comparator = specDefault.interventions[1] || "standard care";
  }

  // Candidate outcomes
  const defaultOutcomes = KB[specialty].outcomesRanked;
  // One entry per endpoint: "overall survival" and "overall survival (OS)" are the same outcome.
  const outcomeKey = (o: string) => o.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const outcomes: string[] = [];
  for (const o of [...matchedOutcomes, ...defaultOutcomes]) {
    if (outcomes.length >= 6) break;
    const k = outcomeKey(o);
    if (!k || outcomes.some(x => { const xk = outcomeKey(x); return xk === k || xk.includes(k) || k.includes(xk); })) continue;
    outcomes.push(o);
  }

  const primaryOutcome = outcomes[0] || "primary clinical outcome";
  const secondaryOutcome1 = outcomes[1] || outcomes[0] || "secondary clinical complications";
  const secondaryOutcome2 = outcomes[2] || outcomes[0] || "treatment-related complications";

  const popPhrase = formulatePopulationPhrase(population, specialty);
  const aux = auxVerbFor(intervention);
  const q1Action = formulateOutcomeVerbPhrase("primary", primaryOutcome);
  const q2Action = formulateOutcomeVerbPhrase("secondary", secondaryOutcome1);
  const q3Action = formulateOutcomeVerbPhrase("subgroup", secondaryOutcome2);

  // Build 4 strictly calibrated, logically separated PICO questions
  const suggestedQuestions: Array<{ question: string; rationale: string }> = [
    {
      question: `In ${popPhrase} (P), ${aux} ${intervention} (I) compared with ${comparator} (C) ${q1Action} (O)?`,
      rationale: `Evaluates the primary therapeutic efficacy of ${intervention} versus ${comparator} on the key clinical endpoint.`
    },
    {
      question: `In ${popPhrase} (P), ${aux} ${intervention} (I) compared with ${comparator} (C) ${q2Action} (O)?`,
      rationale: `Addresses secondary therapeutic outcomes, clinical safety, and comparative treatment benefits.`
    },
    {
      question: `In ${popPhrase} (P), ${aux} ${intervention} (I) compared with ${comparator} (C) ${q3Action} (O)?`,
      rationale: `Focuses on balancing procedural safety, organ preservation, and key clinical milestones.`
    },
    {
      question: `In ${popPhrase} (P), ${aux} ${intervention} (I) compared with ${comparator} (C) improve patient-reported quality of life and treatment satisfaction (O)?`,
      rationale: `Measures patient-centered outcomes, symptom relief sustainability, and overall care satisfaction.`
    }
  ];

  return {
    specialty,
    population,
    intervention,
    comparator,
    outcomes,
    suggestedQuestions
  };
}
