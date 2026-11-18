import { formatVancouverReference, elementByType, type PicoElement } from "./relevance.ts";
import type { AuditableRef } from "./relevance.ts";
import { extractPicoFromQuestion } from "./pico-parser.ts";
import { getSpecialtyDefinition } from "./specialties.ts";
import { parseAuthorNames } from "./citation-styles.ts";
import { designOf } from "./relevance.ts";
import { assertedDirection, reportedDirection, splitSentences } from "./claim-finalization.ts";
import { auxVerbFor, outcomeVerbFor } from "./clinical-semantics.ts";
import { SEARCH_SOURCE_OPTIONS } from "./literature-sources.ts";

export interface DeterministicCommentaryInput {
  selectedQuestion: string;
  outcomesText: string;
  /** Context or note regarding evidence synthesis pathway. */
  reason?: string;
  pool: AuditableRef[];
  elements?: PicoElement[];
  topic?: string;
  specialty?: string;
}

function cleanPhrase(text: string): string {
  return String(text || "")
    .replace(/\s*\([PICO]\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MINOR_WORDS = new Set(["versus", "vs", "vs.", "for", "in", "with", "without", "and", "or", "of", "to", "on", "at", "by", "per", "from", "a", "an", "the", "into", "over"]);

function titleCaseWord(word: string): string {
  // Keep the author's casing for anything that is not a plain lower-case word: acronyms and mixed
  // case terms (eGFR, HbA1c, PASI, CPC, OS, ICS/LABA/LAMA, mRS) must never become "Egfr" or "(os)".
  const core = word.replace(/^[("'[]+|[)"'\],.;:]+$/g, "");
  if (/[A-Z]/.test(core.slice(1)) || /^[A-Z0-9][A-Z0-9/+-]*$/.test(core) || /\d/.test(core)) return word;
  const lower = word.toLowerCase();
  if (MINOR_WORDS.has(lower)) return lower;
  const i = word.search(/[a-zA-Z]/);
  if (i < 0) return word;
  return word.slice(0, i) + word.charAt(i).toUpperCase() + word.slice(i + 1).toLowerCase()
    .replace(/-([a-z])/g, (_, c: string) => `-${c}`);
}

function toAcademicTitleCase(phrase: string): string {
  const words = cleanPhrase(phrase).split(/\s+/);
  if (!words.length || !words[0]) return "";
  return words.map((w, idx) => {
    if (idx === 0) {
      const t = titleCaseWord(w);
      const i = t.search(/[a-zA-Z]/);
      return i < 0 ? t : t.slice(0, i) + t.charAt(i).toUpperCase() + t.slice(i + 1);
    }
    return titleCaseWord(w);
  }).join(" ");
}

/** Lower-case the first letter unless the phrase starts with an acronym ("SGLT2", "HFrEF"). */
function midSentence(phrase: string): string {
  const p = cleanPhrase(phrase);
  if (!p) return p;
  const first = p.split(/\s+/)[0];
  if (/^[A-Z0-9][A-Z0-9-]+$/.test(first) || /[A-Z].*[A-Z]/.test(first.slice(1))) return p;
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** "Patients with heart failure ..." -> "heart failure ..." (the condition, for titles and keywords). */
function conditionOf(population: string): string {
  return cleanPhrase(population)
    .replace(/^(?:adult\s+|pediatric\s+|older\s+|pregnant\s+)?(?:patients|women|men|adults|individuals|people|participants)\s+(?:diagnosed\s+with|presenting\s+with|with|undergoing|who\s+have)\s+/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();
}

/** "Circulation. Heart failure" -> "Circulation: Heart Failure" so a journal name never ends a sentence. */
function journalInText(journal: string): string {
  return cleanPhrase(journal).replace(/\.\s+(?=\S)/g, ": ").replace(/\.$/, "");
}

/** First author's surname, whatever format the provider used ("F. Zannad", "McMurray JJV"). */
function firstSurname(authors: string): string {
  const parsed = parseAuthorNames(authors);
  const s = (parsed[0]?.surname || "").replace(/[.,;]+$/, "").trim();
  return s && s.length > 1 ? s : "";
}

const DESIGN_LABEL: Record<string, string> = {
  "systematic review / meta-analysis": "systematic review and meta-analysis",
  "randomized trial": "randomized controlled trial",
  "clinical trial": "clinical trial",
  "cohort study": "cohort study",
  "narrative review": "narrative review",
  unclassified: "clinical study"
};

/** Phrases the commentary must never put in a quoted finding (estimates or overclaiming wording). */
const UNQUOTABLE = /95\s*%|\bci\b|confidence interval|p\s*[<=>]\s*0?\.|risk ratio|hazard ratio|odds ratio|\b(?:hr|rr|or)\s*[=,:]|demonstrates that|confirms that|proves that|is effective|should be recommended|the evidence supports/i;

/**
 * The sentence of an abstract that states its finding: the labelled conclusion when there is
 * one, otherwise the last results-style sentence. Returned only when it can be quoted without
 * carrying an effect estimate, and only when its direction agrees with the record overall, so
 * the quote survives claim finalization as supported by the record it cites.
 */
/** Whether a sentence is about the outcome: any substantive outcome word (or its stem) appears. */
function mentionsOutcome(sentence: string, outcome: string, population = ""): boolean {
  const hay = sentence.toLowerCase();
  // Words shared with the population ("heart failure" in "heart failure hospitalization" for an
  // HFrEF question) say nothing about the outcome, so they do not count.
  const popWords = new Set(population.toLowerCase().split(/[^a-z0-9]+/));
  const toks = outcome.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !popWords.has(t) && !/^(?:with|from|rate|risk|time|the|and|score|change|composite|endpoint|outcome|primary|total)$/.test(t));
  return toks.some(t => hay.includes(t.length > 6 ? t.slice(0, 6) : t));
}

export function extractFinding(rec: AuditableRef, outcome = "", population = ""): string {
  const ctx = String(rec.context || "").replace(/\s+/g, " ").trim();
  if (ctx.length < 60) return "";
  const labelled = /\b(?:CONCLUSIONS?|INTERPRETATION|Conclusions?|Interpretation)\s*:\s*(.+?)(?=\s+[A-Z][A-Z /&-]{3,}:|$)/.exec(ctx);
  const pool = labelled ? splitSentences(labelled[1]) : splitSentences(ctx.replace(/\b[A-Z][A-Z /&-]{3,}:\s*/g, "")).reverse();
  const recDir = reportedDirection(rec);
  let fallback = "";
  for (const raw of pool) {
    const sent = raw.replace(/^(?:In conclusion|To conclude|Overall|Conclusions?)[,:]\s*/i, "").trim();
    // A sentence that leans on the previous one ("However, the reductions were larger...") is
    // not a self-contained finding.
    if (/^(?:however|moreover|furthermore|additionally|in addition|in contrast|conversely|similarly|also|thus|therefore|this|these|it|they)\b/i.test(sent)) continue;
    const words = sent.split(/\s+/).length;
    if (words < 6 || words > 45) continue;
    if (UNQUOTABLE.test(sent)) continue;
    // Registration lines, funding notes and bracketed trial-name lists are not findings.
    if (/\bNCT\d{6,}|clinicaltrials\.gov|\bISRCTN|\b(?:funded|supported) by\b|^\(|^\[|trial registration/i.test(sent)) continue;
    if (/^(?:we|this|these|our)\s+(?:aim|sought|hypothesi|investigat|evaluat|assess|conduct|perform)/i.test(sent)) continue;
    const dir = assertedDirection(sent);
    if (dir && recDir && dir !== recDir) continue;
    // A finding states a result; a sentence without any result verb is a description of methods.
    if (!dir && !/\b(?:found|showed|shown|was|were|is|are|had|did|may|might|suggest\w*|associated|resulted|achieved|remain\w*|appear\w*|support\w*|did not|no\s)\b/i.test(sent)) continue;
    const clean = sent.replace(/[.;:\s]+$/, "");
    // Prefer the conclusion that speaks to the selected outcome over one about a side analysis.
    if (!outcome || mentionsOutcome(clean, outcome, population)) return clean;
    if (!fallback) fallback = clean;
  }
  return fallback;
}

/**
 * Deterministic scientific evidence commentary adhering strictly to Vancouver style (ICMJE / NLM).
 *
 * Written from the claim-filtered records themselves: each study is described by its design,
 * first author, year and journal, and its finding is the conclusion sentence of its own abstract,
 * quoted and cited. Nothing is asserted that a cited record does not state, no effect estimate is
 * produced, and the in-text numbers correspond exactly to the Vancouver bibliography.
 */
export function generateDeterministicCommentary(
  opts: DeterministicCommentaryInput
): Record<string, unknown> {
  const pool = (opts.pool || []).slice(0, 8);
  const question = (opts.selectedQuestion || opts.topic || "").trim() || "the selected clinical question";
  const outcomesText = (opts.outcomesText || "").trim() || "the selected outcome";

  // Retain only records with verifiable citation metadata
  const entries = pool
    .filter(r => r && r.title && r.authors && r.year && /^(19|20)\d{2}/.test(String(r.year)))
    .map((r, i) => {
      const title = String(r.title || "").trim();
      const journal = String(r.journal || "").trim();
      const pubTypes = r.pubType || (r.publicationTypes || []).join(" ");
      const design = designOf(title, journal, pubTypes);
      return {
        record: r,
        index: i + 1,
        numToken: `[${i + 1}]`,
        surname: firstSurname(String(r.authors || "")),
        year: String(r.year || "").trim().slice(0, 4),
        title,
        journal: journalInText(journal),
        design,
        designLabel: DESIGN_LABEL[design] || "clinical study",
        finding: extractFinding(r, outcomesText, String(opts.elements?.find(e => /population/i.test(e.label))?.value || "")),
        direction: null as ReturnType<typeof reportedDirection>,
        vancouver: formatVancouverReference(r, i + 1)
      };
    });

  const refs = entries.map(e => e.vancouver);
  const n = entries.length;
  const plural = n === 1;
  const cite = (list: typeof entries): string => {
    const nums = list.map(e => e.index).sort((x, y) => x - y);
    if (!nums.length) return "";
    const runs: string[] = [];
    for (let i = 0; i < nums.length; i++) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      runs.push(j - i >= 2 ? `${nums[i]}-${nums[j]}` : j > i ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
      i = j;
    }
    return `[${runs.join(", ")}]`;
  };
  const allCiteToken = cite(entries);

  // Extract structured PICO elements
  const byType = elementByType(opts.elements || []);
  let popVal = cleanPhrase(byType.population?.value || "");
  let intVal = cleanPhrase(byType.intervention?.value || "");
  let compVal = cleanPhrase(byType.comparator?.value || "");
  const outVal = cleanPhrase(byType.outcome?.value || outcomesText || "");

  if ((!popVal || !intVal) && question && question !== "the selected clinical question") {
    const parsed = extractPicoFromQuestion(question, question);
    if (!popVal) popVal = cleanPhrase(parsed.condition);
    if (!intVal) intVal = cleanPhrase(parsed.intervention);
    if (!compVal) compVal = cleanPhrase(parsed.comparator);
  }

  const outcome = midSentence(outVal || outcomesText);
  const population = midSentence(popVal) || "the target population";
  const condition = conditionOf(popVal) || population;
  const intervention = midSentence(intVal) || "the intervention";
  const comparator = midSentence(compVal) || "the comparator";
  // A record counts towards a direction only when its quoted conclusion is about the selected
  // outcome and states one; a side analysis (mechanism, subgroup biomarker) is not counted.
  for (const e of entries) {
    e.direction = e.finding && mentionsOutcome(e.finding, outcome, popVal) ? assertedDirection(e.finding) : null;
  }
  const verb = outcomeVerbFor(outcome);
  const verbs = auxVerbFor(intervention) === "do" ? verb : `${verb}s`;
  const passiveComparator = /^(?:placebo|standard care|usual care|no treatment)/i.test(comparator);
  const whether = `whether ${intervention}, compared with ${comparator}, ${verbs} ${outcome} in ${/^(?:patients|women|men|adults|children|infants|people|individuals)\b/i.test(population) ? population : `patients with ${population}`}`;

  // Keywords extraction
  const STOP = new Set([
    "the", "and", "for", "with", "does", "what", "which", "that", "this", "from", "into", "vs",
    "patients", "women", "study", "studies", "versus", "among", "their", "there", "been", "are",
    "was", "were", "who", "how", "than", "then", "when", "while", "have", "has", "had", "but", "not",
    "you", "your", "our", "its", "his", "her", "can", "will", "would", "should", "could", "may"
  ]);
  const QUESTION_VERB = /^(compare[ds]?|comparing|improv(e|es|ed|ing|ement)|reduc(e|es|ed|ing|tion)|increas(e|es|ed|ing)|decreas(e|es|ed|ing)|prevent(s|ed|ing|ion)?|affect(s|ed|ing)?|influence[ds]?|chang(e|es|ed|ing)|effect(s|ed)?|benefit(s|ed)?|outcome[s]?|result(s|ed)?|risk[s]?|safe|safety)$/i;
  const keywords: string[] = [];
  const addKeyword = (raw: string) => {
    const w = conditionOf(raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, ""));
    if (w.length < 4 || w.length > 60) return;
    if (STOP.has(w.toLowerCase())) return;
    if (QUESTION_VERB.test(w)) return;
    if (keywords.some(k => k.toLowerCase() === w.toLowerCase())) return;
    keywords.push(w);
  };
  const PHRASE_SPLIT = /[,;()]| compared with | versus | vs\.? | in patients with | in women with /i;
  for (const phrase of [...(opts.elements || []).map(e => e.value), outcomesText]) {
    if (keywords.length >= 6) break;
    for (const part of String(phrase || "").split(PHRASE_SPLIT)) addKeyword(part);
  }
  if (keywords.length < 3) {
    for (const w of question.split(/[^A-Za-z0-9-]+/)) {
      if (keywords.length >= 6) break;
      if (w.length < 4 || w.length > 40 || STOP.has(w.toLowerCase())) continue;
      addKeyword(w);
    }
  }
  const keywordList = keywords.slice(0, 6);

  // Title: comparison when the comparator is an active treatment, otherwise the intervention's
  // effect on the outcome. The verb follows the outcome ("Reducing" mortality, never "Optimizing" it).
  const cleanQ = question.replace(/\s*\([PICO]\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  const gerund = verb === "reduce" ? "Reducing" : "Improving";
  let title = "";
  if (!cleanQ || cleanQ === "the selected clinical question" || cleanQ.startsWith("Does X compared")) {
    title = `Evidence Synthesis: ${cleanQ}`;
  } else if (intVal && compVal && !passiveComparator && compVal.toLowerCase() !== intVal.toLowerCase()) {
    title = `${toAcademicTitleCase(intVal)} versus ${toAcademicTitleCase(compVal)} for ${gerund} ${toAcademicTitleCase(outVal || outcomesText)} in ${toAcademicTitleCase(condition)}: A Critical Evidence Commentary`;
  } else if (intVal && popVal) {
    title = `${toAcademicTitleCase(intVal)} for ${gerund} ${toAcademicTitleCase(outVal || outcomesText)} in ${toAcademicTitleCase(condition)}: A Critical Evidence Commentary`;
  } else {
    title = `Evidence Synthesis: ${cleanQ.length > 110 ? cleanQ.slice(0, 107).replace(/\s+\S*$/, "") + "…" : cleanQ}`;
  }

  const sourceList = SEARCH_SOURCE_OPTIONS.map(o => o.name.replace(/ \(PubMed Central\)$/, "")).join(", ").replace(/, ([^,]+)$/, " and $1");

  if (n === 0) {
    return {
      title,
      abstract:
        `**Background:** The clinical question addressed is ${whether}. ` +
        `\n\n**Methods:** ${sourceList} were searched for ${outcome}; records were retained only when they addressed the population, the intervention or comparator, and the outcome. ` +
        `\n\n**Results:** No directly supporting clinical records meeting the claim verification filter were retained. ` +
        `\n\n**Conclusion:** Direct comparative evidence for this specific clinical configuration remains sparse in current indexed literature.`,
      keywords: keywordList,
      introduction:
        `This synthesis evaluates ${whether}. ` +
        `No records with verifiable citations were retained for this comparison.`,
      discussion: `No records with a verifiable citation were retained for ${outcome}. Further prospective controlled trials are warranted.`,
      conclusion: `No supporting records were retained for this question in the current filtered evidence base.`,
      references: []
    };
  }

  // Publication years span
  const years = entries.map(e => parseInt(e.year, 10)).filter(y => !isNaN(y));
  const minYear = years.length ? Math.min(...years) : "";
  const maxYear = years.length ? Math.max(...years) : "";
  const yearSpanText = minYear === maxYear ? `in ${minYear}` : `between ${minYear} and ${maxYear}`;

  // Design profile, from the records' own titles and publication types.
  const byDesign = (d: string) => entries.filter(e => e.design === d);
  const meta = byDesign("systematic review / meta-analysis");
  const rcts = byDesign("randomized trial");
  const trials = [...rcts, ...byDesign("clinical trial")];
  const others = entries.filter(e => !meta.includes(e) && !trials.includes(e));
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const count = (k: number, one: string, many: string) => `${WORDS[k] ?? k} ${k === 1 ? one : many}`;
  const Count = (k: number, one: string, many: string) => { const c = count(k, one, many); return c.charAt(0).toUpperCase() + c.slice(1); };
  const designParts = [
    meta.length ? `${count(meta.length, "systematic review or meta-analysis", "systematic reviews or meta-analyses")} ${cite(meta)}` : "",
    trials.length ? `${count(trials.length, "randomized or controlled trial", "randomized or controlled trials")} ${cite(trials)}` : "",
    others.length ? `${count(others.length, "study of another design", "studies of other designs")} ${cite(others)}` : ""
  ].filter(Boolean);
  const designSentence = designParts.length > 1
    ? `${designParts.slice(0, -1).join(", ")} and ${designParts[designParts.length - 1]}`
    : designParts[0];

  // What the abstracts report, grouped by direction. Only records whose own text states a
  // direction are counted, and each group cites exactly the records it describes.
  const favourable = entries.filter(e => e.direction === (verb === "reduce" ? "reduction" : "increase"));
  const nullFindings = entries.filter(e => e.direction === "no-difference");
  const silent = entries.filter(e => !favourable.includes(e) && !nullFindings.includes(e));
  const ordered = [...meta, ...rcts, ...trials.filter(e => !rcts.includes(e)), ...others];
  // The abstract quotes the strongest-design record on each side: one favourable and one null
  // finding when both exist, so the summary does not present only one side of the evidence.
  const highlights = [
    ordered.find(e => favourable.includes(e) && e.finding),
    ordered.find(e => nullFindings.includes(e) && e.finding)
  ].filter((e): e is (typeof entries)[number] => !!e);
  if (!highlights.length) {
    const any = ordered.find(e => e.finding && mentionsOutcome(e.finding, outcome, popVal)) || ordered.find(e => e.finding);
    if (any) highlights.push(any);
  }

  const who = (e: (typeof entries)[number]) => (e.surname ? `${e.surname} et al.` : "The authors");

  // Structured abstract. Every sentence either describes the method or reports what the cited
  // records themselves state.
  const abstract = [
    `**Background:** Treatment decisions for ${population} depend on whether ${intervention}, compared with ${comparator}, ${verbs} ${outcome} ${allCiteToken}.`,
    `**Objective:** To appraise the published evidence on ${whether} ${allCiteToken}.`,
    `**Methods:** ${sourceList} were searched concurrently. Records were de-duplicated across databases and retained only when they addressed the population, the intervention or comparator, and the outcome. ${n} record${plural ? " was" : "s were"} retained, published ${yearSpanText} ${allCiteToken}.`,
    `**Results:** The retained evidence comprises ${designSentence}.` +
      highlights.map(h => ` In the ${h.designLabel} by ${who(h)} (${h.year}), the authors concluded: "${h.finding}" ${h.numToken}.`).join(""),
    `**Conclusions:** ` + (favourable.length
      ? `${Count(favourable.length, "retained record reports", "retained records report")} a favourable direction of effect of ${intervention} on ${outcome} ${cite(favourable)}` +
        (nullFindings.length ? `, while ${count(nullFindings.length, "record reports", "records report")} no significant difference in ${outcome} ${cite(nullFindings)}.` : ".")
      : `The retained records ${allCiteToken} address this comparison, but their abstracts do not state a consistent direction of effect on ${outcome}.`) +
      ` A formal systematic review with risk-of-bias assessment is required before firm practice recommendations.`
  ].join("\n\n");

  // Introduction: the clinical question and why it is being appraised, without unreferenced claims.
  const introduction = [
    `This commentary appraises the evidence comparing ${intervention} with ${comparator} for ${outcome} in ${population} ${allCiteToken}. ${outcome.charAt(0).toUpperCase() + outcome.slice(1)} is the endpoint against which the two strategies are judged, and the question is framed in PICO form so that each retained record can be checked against the population, the intervention or comparator, and the outcome.`,
    `The literature was searched across ${sourceList}, so that both MEDLINE-indexed trials and records indexed only in open-access, preprint or citation databases were considered. Records describing other populations or other subtypes of ${condition} were excluded, as were study protocols, trial registrations and conference abstracts, which do not report peer-reviewed results.`,
    `The ${n} retained record${plural ? "" : "s"} ${allCiteToken} are appraised below, study by study, before their consistency, certainty and applicability are considered.`
  ].join("\n\n");

  // Study-by-study appraisal from each record's own abstract.
  const studySummaries = entries.map(e => {
    const lead = `${who(e)} (${e.year}) reported a ${e.designLabel}${e.journal ? ` in ${e.journal}` : ""} ${e.numToken}.`;
    if (e.finding) return `${lead} The authors concluded: "${e.finding}" ${e.numToken}.`;
    const why = String(e.record.context || "").length > 60
      ? "Its abstract contains no self-contained concluding statement that can be quoted without its effect estimates, so its findings are best read in the full report"
      : "Its abstract was not available from the indexing databases, so its findings are not summarized here";
    return `${lead} ${why}; it is retained because its title and metadata address the question ("${e.title.replace(/\.$/, "").replace(/"/g, "'")}") ${e.numToken}.`;
  });

  const discIntro =
    `${n} record${plural ? "" : "s"} address${plural ? "es" : ""} ` +
    `the selected population, intervention and outcome, and ${plural ? "is" : "are"} ` +
    `evaluated in this synthesis in Vancouver style: ${allCiteToken}.`;

  const discScope =
    `#### Evidence Base\n\n` +
    `The evidence base comprises ${designSentence}, published ${yearSpanText}. ` +
    `Each record was retrieved from at least one of ${sourceList} and matched against the population, the intervention or comparator, and ${outcome}.`;

  const discStudyByStudy =
    `#### Study-by-Study Appraisal\n\n` +
    studySummaries.join("\n\n");

  const discConsistency =
    `#### Consistency of Findings\n\n` +
    [
      favourable.length ? `${Count(favourable.length, "record states", "records state")} a direction of effect favouring ${intervention} for ${outcome} ${cite(favourable)}.` : "",
      nullFindings.length ? `${Count(nullFindings.length, "record reports", "records report")} no significant difference in ${outcome} ${cite(nullFindings)}.` : "",
      silent.length ? `${Count(silent.length, "record does", "records do")} not state a direction of effect in the abstract available for appraisal ${cite(silent)}.` : "",
      favourable.length && !nullFindings.length
        ? `No retained record reports a direction of effect opposite to the others.`
        : favourable.length && nullFindings.length
          ? `The divergence between these groups may reflect differences in population, dose, follow-up or outcome definition, which the abstracts alone cannot resolve.`
          : ""
    ].filter(Boolean).join(" ");

  const certaintyBase = meta.length || rcts.length >= 2
    ? `The evidence base includes ${[meta.length ? count(meta.length, "systematic review or meta-analysis", "systematic reviews or meta-analyses") : "", rcts.length ? count(rcts.length, "randomized trial", "randomized trials") : ""].filter(Boolean).join(" and ")}, the designs that can support at least moderate certainty under GRADE.`
    : `Few randomized or meta-analytic records were retained, so the certainty of the evidence is likely to be low under GRADE.`;
  const discMethodology =
    `#### Certainty of Evidence\n\n` +
    `${certaintyBase} ` +
    `This commentary did not perform a formal assessment of risk of bias, inconsistency, indirectness, imprecision or publication bias, and its appraisal is limited to titles, abstracts and publication metadata; certainty should be graded from the full reports.`;

  const discClinicalTranslation =
    `#### Applicability\n\n` +
    `The findings apply to ${population} similar to those enrolled in the retained studies. ` +
    `Clinicians should check each study's eligibility criteria, dose and follow-up against the patient in front of them, and discuss the expected advantages, harms and remaining uncertainty with the patient.`;

  const isObGyn = /^(obstetrics|gynecology|infertility|obgyn)$/i.test(opts.specialty || "");
  const specDef = opts.specialty ? getSpecialtyDefinition(opts.specialty) : null;
  const endpointPhrase = specDef?.gapBoilerplate?.endpointPhrase
    || (isObGyn ? "cumulative live birth" : "long-term functional outcomes");
  const trialDomainPhrase = specDef?.gapBoilerplate?.trialDomainPhrase
    || (isObGyn ? "reproductive and gynecological" : specDef ? specDef.label.toLowerCase() : "specialty-specific");

  const discGaps =
    `#### Research Gaps\n\n` +
    `The following questions remain open:\n\n` +
    `- **Head-to-head comparisons:** adequately powered randomized trials comparing ${intervention} directly with ${passiveComparator ? "active alternatives" : comparator} on ${outcome}.\n` +
    `- **Markers of response:** validated clinical or biomarker markers identifying which patients respond best to ${intervention}.\n` +
    `- **Dose, timing and duration:** the optimal dose, time of initiation and duration of ${intervention}.\n` +
    `- **Long-term and patient-reported endpoints:** ${endpointPhrase}, safety and quality of life beyond the follow-up of existing trials.\n` +
    `- **Core outcome sets:** standardized outcome definitions across ${trialDomainPhrase} trials to allow reliable pooling.`;

  const discussion = [
    discIntro,
    discScope,
    discStudyByStudy,
    discConsistency,
    discMethodology,
    discClinicalTranslation,
    discGaps
  ].join("\n\n");

  // Conclusion: restates only what the cited records state, then the limits of this appraisal.
  const conclusionP1 =
    `The evidence for this clinical question comprises the ${n} cited record${plural ? "" : "s"} ${allCiteToken}. ` +
    (favourable.length
      ? `${Count(favourable.length, "record states", "records state")} a favourable direction of effect of ${intervention} on ${outcome} ${cite(favourable)}${nullFindings.length ? `, and ${count(nullFindings.length, "record reports", "records report")} no significant difference in ${outcome} ${cite(nullFindings)}` : ""}.`
      : `The retained abstracts do not state a consistent direction of effect of ${intervention} on ${outcome}.`);

  const conclusionP2 =
    `For practicing clinicians, these records should be read in full and weighed against the individual patient's risk, preferences and comorbidities. ` +
    `A formal systematic review with risk-of-bias and certainty assessment is required before this appraisal is translated into practice recommendations.`;

  const conclusion = `${conclusionP1}\n\n${conclusionP2}`;

  return {
    title,
    abstract,
    keywords: keywordList,
    introduction,
    discussion,
    conclusion,
    references: refs
  };
}
