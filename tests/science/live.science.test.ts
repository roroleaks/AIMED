import test from "node:test";
import assert from "node:assert/strict";
import { scoreRecords } from "../../src/lib/explore-scoring.ts";
import { generateDeterministicScreen } from "../../src/lib/deterministic-screen.ts";
import { composeManuscript } from "../../src/lib/manuscript-composer.ts";
import { fetchFromSource } from "../../src/lib/literature-sources.ts";
import type { PicoWord } from "../../src/lib/pico-roles.ts";

const RUN_LIVE = process.env.AIMED_LIVE_NETWORK === "1";

test("LIVE-SCI-05. ADV-HOMEO against live PubMed concludes insufficient direct evidence", { skip: !RUN_LIVE }, async () => {
  const words: PicoWord[] = [
    { word: "IVF", role: "population" },
    { word: "homeopathy", role: "intervention" },
    { word: "placebo", role: "comparator" },
    { word: "live birth", role: "outcome" },
  ];
  const arts = await fetchFromSource("pubmed", "IVF homeopathy live birth", 10);
  const { scored } = scoreRecords(arts, "In IVF (P), does homeopathy (I) compared with placebo (C) improve live birth (O)?", "gap");
  const eligible = scored.filter((r) => r.relevancePct >= 30);
  const screen = generateDeterministicScreen(words, eligible);
  assert.ok(screen.phrases.established.basis.toLowerCase().startsWith("unavailable"));
  const m = composeManuscript({
    specialty: "obgyn",
    words,
    category: "gap",
    phrase: screen.phrases.gap.phrase,
    records: eligible,
    style: "vancouver",
  });
  const concl = m.sections.find((s) => /conclusion/i.test(s.heading))?.paragraphs.join(" ") ?? "";
  assert.ok(/^(?:In conclusion,\s*)?Insufficient direct evidence/i.test(concl));
});

test("LIVE-SCI-10. ONC-1 and ART-2 retrieve real landmark trials from PubMed", { skip: !RUN_LIVE }, async () => {
  const oncArts = await fetchFromSource("pubmed", "advanced non-small cell lung cancer pembrolizumab overall survival", 20);
  assert.ok(oncArts.length > 0, "PubMed should return NSCLC pembrolizumab articles");

  const art2Arts = await fetchFromSource("pubmed", "PGT-A blastocyst morphology live birth IVF", 20);
  assert.ok(art2Arts.length > 0, "PubMed should return PGT-A IVF articles");
});
