/**
 * Deterministic PICO role classification and assignment for intake keywords.
 * Maps 3-5 clinical words or short phrases to Population, Intervention, Comparator, Outcome, or Other.
 */

export type PicoRole = "population" | "intervention" | "comparator" | "outcome" | "other";

export interface PicoWord {
  word: string;
  role: PicoRole;
}

export type RoleConfidence = "high" | "medium" | "low";

interface MatchResult {
  role: PicoRole;
  confidence: RoleConfidence;
  weight: number;
}

const CONFIDENCE_WEIGHT: Record<RoleConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1
};

// Priority order on ties: population > intervention > comparator > outcome > other
const ROLE_TIE_PRIORITY: Record<PicoRole, number> = {
  population: 5,
  intervention: 4,
  comparator: 3,
  outcome: 2,
  other: 1
};

// High-confidence exact phrases or strong keyword patterns
const DRUG_SUFFIX_RE = /\b[a-z]+(mab|zumab|nib|tinib|statin|pril|sartan|olol|xaban|gliptin|flozin|tide|parin|prazole|floxacin|cycline|caine|vud|pine|avibactam|rib)\b/i;

const OUTCOME_HIGH_RE = /\b(clinical pregnancy rate|live birth rate|cumulative live birth|miscarriage rate|preterm birth|preterm delivery|ovulation rate|implantation rate|oocyte yield|mature oocytes|cycle cancellation rate|adverse events?|health[- ]related quality of life|patient satisfaction|pain relief|blood loss reduction|neonatal morbidity|maternal mortality|all-cause mortality|cv mortality|in-hospital mortality|28-day mortality|30-day mortality|6-week mortality|perinatal mortality|overall survival|progression-free survival|exacerbation rate|blood culture clearance|lactate clearance|endoscopic healing|clinical remission|steatohepatitis resolution|liver fibrosis improvement|body weight reduction|cardiometabolic risk|skin clearance|durable skin clearance|coronary artery aneurysm|thromboembolic events|intracranial hemorrhage|repeat revascularization|end stage renal disease|hernia recurrence|reoperation rate|revision rate|functional outcome mrs|functional recovery|cpc score|make30|pasi 90|pasi 100|easi 75|hiscr response|madrs remission|madrs|egfr decline|fvc decline|fev1|cervical length|ovarian reserve|ovulation induction|pelvic pain|chronic pain|major bleeding|vertebral fracture|bone mineral density|pruritus score|inflammatory lesions|relapse prevention|mood episode recurrence|treatment failure|treatment resistance|disease progression|hospital admission|picu admission|rebleeding|length of stay|stroke)\b/i;
const OUTCOME_MEDIUM_RE = /\b(rate|rates|risk|risks|birth|births|birthweight|mortality|morbidity|survival|pain|bleeding|efficacy|safety|adverse|outcome|outcomes|success|score|scores|yield|yields|incidence|recurrence|remission|duration|qol|relief|loss|hospitalization|hospitalizations|admission|clearance|healing|resolution|cure|events|complications|progression|revascularization|fracture|rebleeding|stay|stroke)\b/i;

const COMPARATOR_HIGH_RE = /\b(placebo|sham|no treatment|no intervention|usual care|standard care|standard protocol|expectant management|active surveillance|versus|vs\.?|compared with|compared to|comparison|embryologist morphological assessment|morphology-based blastocyst selection|morphological assessment|appendectomy|saline|normal saline)\b/i;
const COMPARATOR_MEDIUM_RE = /\b(control|controls|control group|reference|comparator|standard|baseline|conservative rehabilitation|standard oxygen|normal saline|delayed cholecystectomy)\b/i;

const INTERVENTION_HIGH_RE = /\b(in vitro fertilization|ivf|icsi|intracytoplasmic sperm injection|growth hormone|coenzyme q10|co enzyme q10|coq10|ubiquinol|letrozole|clomiphene|clomifene|metformin|aspirin|low-dose aspirin|progesterone|dhea|dienogest|tamoxifen|gonadotropin|menopur|follitropin|magnesium sulfate|misoprostol|oxytocin|heparin|enoxaparin|cervical cerclage|cerclage|laparoscopy|laparoscopic|hysterectomy|embryo transfer|intrauterine insemination|iui|ablation|embolization|warfarin|alteplase|tenecteplase|esketamine|lithium|valproate|colistin|daptomycin|ceftaroline|vancomycin|fidaxomicin|prednisolone|norepinephrine|tranexamic acid|resmetirom|pirfenidone|alendronate|chemotherapy|immunotherapy|radiotherapy|antibiotics|antiviral|corticosteroid|steroid|vasopressor|anticoagulant|doac|thrombolysis|thrombectomy|cabg|pci|tavr|cpap|bipap|surfactant|ivig|tka|tha|tips|tms|t-dm1|laba|lama|sglt2 inhibitor|jak inhibitor|mechanical ventilation|fluid resuscitation|targeted temperature management|hypothermia|early laparoscopic cholecystectomy|delayed cholecystectomy|robotic total knee arthroplasty|manual tka|total hip arthroplasty|hemiarthroplasty|early acl reconstruction|conservative rehabilitation|laparoscopic tep|lichtenstein open repair|laparoscopic appendectomy|laparoscopic excision|endoscopic band ligation|triple therapy|balanced crystalloids|normal saline|high flow nasal cannula|standard oxygen|surgical valve replacement|transcranial magnetic stimulation|early tips|early norepinephrine|ceftazidime-avibactam|risankizumab|secukinumab|adalimumab|ustekinumab|upadacitinib|dupilumab|pembrolizumab|trastuzumab deruxtecan|olaparib|dapagliflozin|tirzepatide|semaglutide|romosozumab|quetiapine|nintedanib|pgt-a|pgta|preimplantation genetic testing for aneuploidy|preimplantation genetic testing|artificial intelligence embryo selection)\b/i;
const INTERVENTION_MEDIUM_RE = /\b(therapy|therapies|agent|agents|surgery|surgeries|surgical|dose|dosing|mg|mcg|supplementation|administration|induction|insemination|injection|tablet|capsule|infusion|treatment|medication|drug|procedure|inhibitor|inhibitors|reconstruction|arthroplasty|repair|replacement|excision|ligation|stimulation|ventilation|resuscitation|rehabilitation)\b/i;

const POPULATION_HIGH_RE = /\b(poor responders?|poor ovarian response|diminished ovarian reserve|dor|thin endometrium|short cervix|cervical insufficiency|polycystic ovary syndrome|pcos|endometriosis|adenomyosis|preeclampsia|pre-eclampsia|uterine fibroids?|myoma|myomas|recurrent pregnancy loss|rpl|recurrent implantation failure|rif|unexplained infertility|male factor infertility|azoospermia|oligozoospermia|fetal growth restriction|fgr|iugr|gestational diabetes|gdm|placenta accreta spectrum|placenta previa|pprom|chorioamnionitis|heart failure|heart failure reduced ejection fraction|atrial fibrillation|multivessel coronary artery disease|severe aortic stenosis|acute ischemic stroke|ischemic stroke|large vessel occlusion|advanced nsclc|nsclc|metastatic her2-positive breast cancer|advanced ovarian cancer|brca mutation|sepsis|septic shock|sepsis fluid resuscitation|cardiac arrest|severe trauma|hemorrhage|copd|severe eosinophilic asthma|idiopathic pulmonary fibrosis|crohn|crohn's disease|ulcerative colitis|mash|cirrhosis|acute variceal bleeding|acute cholecystitis|acute uncomplicated appendicitis|inguinal hernia|knee osteoarthritis|displaced femoral neck fracture|acl rupture|meniscal tears|major depressive disorder|treatment-resistant depression|bipolar|bipolar i disorder|obesity|chronic kidney disease|diabetes|diabetic|mrsa|mrsa bacteremia|carbapenem resistant enterobacterales|cre|clostridioides difficile|kawasaki disease|infant bronchiolitis|preterm infants|bronchopulmonary dysplasia|plaque psoriasis|atopic dermatitis|hidradenitis suppurativa|high-risk pregnancy|postmenopausal osteoporosis)\b/i;
const POPULATION_MEDIUM_RE = /\b(women|woman|patients?|participants?|subjects?|individuals?|responders?|pregnant|pregnancy|pregnancies|gravida|parity|menopause|menopaus|postmenopausal|nulliparous|multiparous|infants?|neonates?|fetal|fetus|maternal|syndrome|disorder|condition|disease|insufficiency|failure|cervix|ovary|ovarian|uterus|uterine|endometrium|endometrial|fallopian|tubal|cervical|coronary|artery|kidney|cardiac|pulmonary|hepatic|renal|bone|fracture|bacteremia|infection)\b/i;

/**
 * Classifies a single clinical word or short phrase into a PICO role with confidence.
 * Ties are resolved with priority: population > intervention > comparator > outcome > other.
 */
export function classifyWordRole(word: string): { role: PicoRole; confidence: RoleConfidence } {
  const clean = (word || "").trim();
  if (!clean) {
    return { role: "other", confidence: "low" };
  }

  const matches: MatchResult[] = [];

  // Drug-suffix heuristic -> intervention high
  if (DRUG_SUFFIX_RE.test(clean)) {
    matches.push({ role: "intervention", confidence: "high", weight: CONFIDENCE_WEIGHT.high });
  }

  // Check Outcome signals
  if (OUTCOME_HIGH_RE.test(clean)) {
    matches.push({ role: "outcome", confidence: "high", weight: CONFIDENCE_WEIGHT.high });
  } else if (OUTCOME_MEDIUM_RE.test(clean)) {
    matches.push({ role: "outcome", confidence: "medium", weight: CONFIDENCE_WEIGHT.medium });
  }

  // Check Comparator signals
  if (COMPARATOR_HIGH_RE.test(clean)) {
    matches.push({ role: "comparator", confidence: "high", weight: CONFIDENCE_WEIGHT.high });
  } else if (COMPARATOR_MEDIUM_RE.test(clean)) {
    matches.push({ role: "comparator", confidence: "medium", weight: CONFIDENCE_WEIGHT.medium });
  }

  // Check Intervention signals
  if (INTERVENTION_HIGH_RE.test(clean)) {
    matches.push({ role: "intervention", confidence: "high", weight: CONFIDENCE_WEIGHT.high });
  } else if (INTERVENTION_MEDIUM_RE.test(clean)) {
    matches.push({ role: "intervention", confidence: "medium", weight: CONFIDENCE_WEIGHT.medium });
  }

  // Check Population signals
  if (POPULATION_HIGH_RE.test(clean)) {
    matches.push({ role: "population", confidence: "high", weight: CONFIDENCE_WEIGHT.high });
  } else if (POPULATION_MEDIUM_RE.test(clean)) {
    matches.push({ role: "population", confidence: "medium", weight: CONFIDENCE_WEIGHT.medium });
  }

  // If no specific match, check disease suffixes (ia and ic removed to avoid misclassifying procedures/drugs)
  if (matches.length === 0) {
    const isAnatomyOrDisease = /(itis|oma|osis|pathy|syndrome|cervix|ovari|uter|fetal)\b/i.test(clean);
    if (isAnatomyOrDisease) {
      return {
        role: "population",
        confidence: "medium"
      };
    }
    return {
      role: "other",
      confidence: "low"
    };
  }

  // Sort matches by confidence weight descending, then by tie-priority descending
  matches.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return ROLE_TIE_PRIORITY[b.role] - ROLE_TIE_PRIORITY[a.role];
  });

  const best = matches[0];
  return { role: best.role, confidence: best.confidence };
}

/**
 * Assigns PICO roles to an array of clinical words with anti-degeneracy fallback.
 */
export function assignPicoRoles(words: string[]): PicoWord[] {
  const result: PicoWord[] = words.map(w => {
    const { role } = classifyWordRole(w);
    return { word: w, role };
  });

  // Anti-degeneracy fallback: promote missing core roles
  const hasPop = result.some(r => r.role === "population");
  if (!hasPop) {
    // In ART / reproductive context, if an ART procedure (IVF/ICSI) is present alongside another intervention,
    // the procedure is the clinical setting/population
    const artIdx = result.findIndex(r => /\b(in vitro fertilization|ivf|icsi|art)\b/i.test(r.word));
    const hasOtherInt = result.some((r, idx) => idx !== artIdx && (r.role === "intervention" || r.role === "comparator"));
    if (artIdx !== -1 && hasOtherInt) {
      result[artIdx].role = "population";
    } else {
      const popIdx = result.findIndex(
        r => /(itis|oma|osis|pathy|syndrome)\b/i.test(r.word) || POPULATION_MEDIUM_RE.test(r.word) || POPULATION_HIGH_RE.test(r.word)
      );
      if (popIdx !== -1) {
        result[popIdx].role = "population";
      }
    }
  }

  const hasInt = result.some(r => r.role === "intervention");
  if (!hasInt) {
    const intIdx = result.findIndex(
      r => DRUG_SUFFIX_RE.test(r.word) || INTERVENTION_MEDIUM_RE.test(r.word) || INTERVENTION_HIGH_RE.test(r.word)
    );
    if (intIdx !== -1) {
      result[intIdx].role = "intervention";
    }
  }

  const hasOut = result.some(r => r.role === "outcome");
  if (!hasOut && result.length > 0) {
    result[result.length - 1].role = "outcome";
  }

  if (result.length >= 4) {
    const firstRole = result[0].role;
    const allSame = result.every(item => item.role === firstRole);
    if (allSame) {
      result[result.length - 1] = {
        word: result[result.length - 1].word,
        role: "outcome"
      };
    }
  }

  return result;
}
