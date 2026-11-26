import test from "node:test";
import assert from "node:assert/strict";
import { isNonEvidenceTitle } from "./literature-sources.ts";

test("JOB1. job and recruitment adverts are non-evidence", () => {
  for (const t of [
    "Position Available Embryologist/IVF Specialist",
    "Positions available: Clinical Embryologist",
    "Vacancy open for IVF laboratory director",
    "We are hiring an andrologist",
    "Job advertisement: reproductive endocrinologist",
    "Fellowship available in maternal-fetal medicine"
  ]) {
    assert.equal(isNonEvidenceTitle(t), true, t);
  }
});

test("JOB2. genuine trials that mention recruitment or positions are kept", () => {
  for (const t of [
    "Recruitment strategies in randomised trials of infertility treatment",
    "Fetal head position at delivery and perineal trauma: a cohort study",
    "Hiring practices and outcomes of nurse staffing in labour wards: a systematic review",
    "Letrozole versus clomiphene citrate for ovulation induction in PCOS"
  ]) {
    assert.equal(isNonEvidenceTitle(t), false, t);
  }
});
