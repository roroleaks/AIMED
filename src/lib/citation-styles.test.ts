import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CITATION_STYLE_OPTIONS,
  formatReferenceInStyle,
  convertNarrativeToStyle,
  parseAuthorNames
} from "./citation-styles.ts";
import type { AuditableRef } from "./relevance.ts";

const FIXTURES: AuditableRef[] = [
  {
    pmid: "31821536",
    doi: "10.1016/j.ajog.2019.11.1278",
    title: "Cervical cerclage for prevention of preterm birth in singleton pregnancies with prior preterm birth",
    authors: "Berghella V, Rafael TJ, Szychowski JM, Rust OA, Owen J",
    year: "2020",
    journal: "Am J Obstet Gynecol",
    url: "https://doi.org/10.1016/j.ajog.2019.11.1278"
  },
  {
    pmid: "34774823",
    doi: "10.1001/jama.2021.18956",
    title: "Effect of Prophylactic Antibiotics in Patients Undergoing Emergency Cerclage",
    authors: "Smith J, Brown K",
    year: "2021",
    journal: "JAMA",
    url: "https://doi.org/10.1001/jama.2021.18956"
  },
  {
    pmid: "28375620",
    doi: "10.1056/nejmoa1611023",
    title: "Trial of Labor versus Repeat Cesarean Delivery",
    authors: "Taylor LM",
    year: "2018",
    journal: "N Engl J Med",
    url: "https://doi.org/10.1056/nejmoa1611023"
  }
];

test("CS1. CITATION_STYLE_OPTIONS defines Vancouver, APA, and Harvard", () => {
  assert.equal(CITATION_STYLE_OPTIONS.length, 3);
  const ids = CITATION_STYLE_OPTIONS.map(o => o.id);
  assert.deepEqual(ids, ["vancouver", "apa", "harvard"]);
  assert.ok(CITATION_STYLE_OPTIONS[0].name.includes("No Brackets"));
});

test("CS2. parseAuthorNames extracts surnames and initials", () => {
  const parsed1 = parseAuthorNames("Smith JA, Brown K, Taylor LM");
  assert.equal(parsed1.length, 3);
  assert.equal(parsed1[0].surname, "Smith");
  assert.equal(parsed1[0].initials, "J.A.");

  const parsed2 = parseAuthorNames("John Smith and Jane Doe");
  assert.equal(parsed2.length, 2);
  assert.equal(parsed2[0].surname, "Smith");
  assert.equal(parsed2[1].surname, "Doe");
});

test("CS3. formatReferenceInStyle formats Vancouver without brackets around index", () => {
  const v1 = formatReferenceInStyle(FIXTURES[0], "vancouver", 1);
  assert.ok(v1.startsWith("1. Berghella V,"), `Expected "1. Berghella V...", got: ${v1}`);
  assert.ok(!v1.startsWith("[1]"), "Vancouver must not use brackets around index numbers");
  assert.ok(v1.includes("doi:10.1016/j.ajog.2019.11.1278"));
});

test("CS4. formatReferenceInStyle formats APA 7th style with (Year) and DOI", () => {
  const apa1 = formatReferenceInStyle(FIXTURES[1], "apa");
  assert.ok(apa1.includes("Smith, J., & Brown, K. (2021)."), `Expected APA author/year, got: ${apa1}`);
  assert.ok(apa1.includes("https://doi.org/10.1001/jama.2021.18956"));
});

test("CS5. formatReferenceInStyle formats Harvard style with 'Title' and Year", () => {
  const harv1 = formatReferenceInStyle(FIXTURES[1], "harvard");
  assert.ok(harv1.includes("Smith, J. and Brown, K., 2021."), `Expected Harvard author/year, got: ${harv1}`);
  assert.ok(harv1.includes("'Effect of Prophylactic Antibiotics in Patients Undergoing Emergency Cerclage'"));
  assert.ok(harv1.includes("doi:10.1001/jama.2021.18956"));
});

test("CS6. convertNarrativeToStyle converts Vancouver citations WITHOUT brackets", () => {
  const narrative = "Recent clinical trials [1] and meta-analyses [2, 3] demonstrate efficacy across trials [1-3].";
  const converted = convertNarrativeToStyle(narrative, "vancouver", FIXTURES);
  assert.equal(
    converted,
    "Recent clinical trials 1 and meta-analyses 2, 3 demonstrate efficacy across trials 1-3."
  );
  assert.ok(!converted.includes("["), "Must not contain square opening bracket in Vancouver");
  assert.ok(!converted.includes("]"), "Must not contain square closing bracket in Vancouver");
});

test("CS7. convertNarrativeToStyle converts APA citations to (Author, Year)", () => {
  const narrative = "Evidence supports cervical cerclage [1] compared to controls [2].";
  const converted = convertNarrativeToStyle(narrative, "apa", FIXTURES);
  assert.ok(converted.includes("(Berghella et al., 2020)"), `Expected Berghella et al., got: ${converted}`);
  assert.ok(converted.includes("(Smith & Brown, 2021)"), `Expected Smith & Brown, got: ${converted}`);
});

test("CS8. convertNarrativeToStyle converts Harvard citations to (Author Year)", () => {
  const narrative = "Evidence supports cervical cerclage [1] compared to controls [2].";
  const converted = convertNarrativeToStyle(narrative, "harvard", FIXTURES);
  assert.ok(converted.includes("(Berghella et al. 2020)"), `Expected Berghella et al., got: ${converted}`);
  assert.ok(converted.includes("(Smith and Brown 2021)"), `Expected Smith and Brown, got: ${converted}`);
});

test("CS9. validateDeliverableIntegrity passes with Vancouver, APA, and Harvard formatted references", async () => {
  const { validateDeliverableIntegrity } = await import("./deliverable-integrity.ts");
  const { formatVancouverReference } = await import("./relevance.ts");

  const vancouverRefs = FIXTURES.map((r, i) => formatReferenceInStyle(r, "vancouver", i + 1));
  const apaRefs = FIXTURES.map((r) => formatReferenceInStyle(r, "apa"));
  const harvardRefs = FIXTURES.map((r) => formatReferenceInStyle(r, "harvard"));
  const canonicalRefs = FIXTURES.map((r, i) => formatVancouverReference(r, i + 1));

  // Vancouver export
  const resVan = validateDeliverableIntegrity({
    fields: { discussion: "Discussion evaluating [1] and [2] and [3]." },
    references: canonicalRefs,
    retainedRecords: FIXTURES,
    exportReferences: vancouverRefs
  });
  assert.ok(resVan.ok, `Vancouver integrity failed: ${JSON.stringify(resVan)}`);

  // APA export
  const resApa = validateDeliverableIntegrity({
    fields: { discussion: "Discussion evaluating [1] and [2] and [3]." },
    references: canonicalRefs,
    retainedRecords: FIXTURES,
    exportReferences: apaRefs
  });
  assert.ok(resApa.ok, `APA integrity failed: ${JSON.stringify(resApa)}`);

  // Harvard export
  const resHarv = validateDeliverableIntegrity({
    fields: { discussion: "Discussion evaluating [1] and [2] and [3]." },
    references: canonicalRefs,
    retainedRecords: FIXTURES,
    exportReferences: harvardRefs
  });
  assert.ok(resHarv.ok, `Harvard integrity failed: ${JSON.stringify(resHarv)}`);
});
