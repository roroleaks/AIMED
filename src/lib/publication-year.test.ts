import test from "node:test";
import assert from "node:assert/strict";
import { extractPublicationYear, checkCitations, surnamesOf } from "./relevance.ts";

test("PY1. trial code with a year-like number is not read as the publication year", () => {
  const ref =
    "1. Shiraishi Y, et al. Comparison of platinum combination chemotherapy plus pembrolizumab versus platinum combination chemotherapy plus nivolumab-ipilimumab for treatment-naive advanced non-small-cell lung cancer in Japan (JCOG2007): an open-label, multicentre, randomised, phase 3 trial. The Lancet. Respiratory medicine. 2024. doi:10.1016/S2213-2600(24)00185-1";
  assert.equal(extractPublicationYear(ref), "2024");
});

test("PY2. trial names and DOIs containing 19xx/20xx digits are ignored", () => {
  assert.equal(
    extractPublicationYear("2. Wolchok JD, et al. Overall survival (CheckMate 067). N Engl J Med. 2019;381(16):1535-46. doi:10.1056/NEJMoa1910836"),
    "2019"
  );
  assert.equal(
    extractPublicationYear("3. Kim S. KEYNOTE189 long-term follow-up. J Clin Oncol. 2021;39:1. doi:10.1200/JCO.2013.99.0001"),
    "2021"
  );
  assert.equal(extractPublicationYear("4. Lee H. JCOG1904 phase 2 results. Ann Oncol. 2022 Mar;33(3):10."), "2022");
});

test("PY3. APA and Harvard year positions", () => {
  assert.equal(extractPublicationYear("Gandhi, L., Rodriguez-Abreu, D., & Garassino, M. (2018). Pembrolizumab plus chemotherapy. N Engl J Med, 378, 2078."), "2018");
  assert.equal(extractPublicationYear("Mok, T.S.K., Wu, Y.L., 2019. Pembrolizumab versus chemotherapy. Lancet, 393, 1819-1830."), "2019");
});

test("PY4. no year yields an empty string", () => {
  assert.equal(extractPublicationYear("Smith J. Untitled manuscript."), "");
});

test("PY5. author-year citation to a paper whose title carries a trial code resolves", () => {
  const refs = [
    "1. Shiraishi Y, et al. Comparison of regimens in Japan (JCOG2007): an open-label trial. The Lancet. Respiratory medicine. 2024. doi:10.1016/S2213-2600(24)00185-1"
  ];
  const res = checkCitations("The trial (Shiraishi et al., 2024) reported benefit [1].", refs);
  assert.deepEqual(res.orphans, []);
  assert.deepEqual(surnamesOf(refs[0]).slice(0, 1), ["Shiraishi"]);
});
