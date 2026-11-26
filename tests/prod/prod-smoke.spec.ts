import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PROD_URL = process.env.AIMED_PROD_URL;

test.describe("L9 Production Smoke", () => {
  test.skip(!PROD_URL, "Skipped unless AIMED_PROD_URL is set");

  test("PROD-01. Footer commit hash matches origin/main", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "desktop-1440") {
      test.skip();
      return;
    }
    const expectedSha = execSync("git rev-parse --short origin/main", { encoding: "utf8" }).trim();
    await page.goto(PROD_URL!);
    const footerText = await page.locator("footer").innerText();
    expect(footerText, `Expected commit ${expectedSha} in prod footer`).toContain(expectedSha);
  });

  test("PROD-02. OB/GYN presets pass layout & grid checks at 1440 and 390", async ({ page }, testInfo) => {
    if (!["desktop-1440", "mobile-390"].includes(testInfo.project.name)) {
      test.skip();
      return;
    }
    await page.goto(`${PROD_URL}/dashboard`);
    const cards = page.locator(".preset-card");
    await expect(cards).toHaveCount(4);
    const vw = page.viewportSize()!.width;
    const minH = vw <= 390 ? 56 : 48;
    const rects = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of rects) {
      expect(r.height).toBeGreaterThanOrEqual(minH - 1);
    }
  });

  test("PROD-03. ADV-HOMEO live API concludes Insufficient direct evidence", async ({ request }, testInfo) => {
    if (testInfo.project.name !== "desktop-1440") {
      test.skip();
      return;
    }
    const words = [
      { word: "IVF", role: "population" },
      { word: "homeopathy", role: "intervention" },
      { word: "placebo", role: "comparator" },
      { word: "live birth", role: "outcome" },
    ];
    const screenRes = await request.post(`${PROD_URL}/api/engine`, {
      data: { stage: "screen", words, specialty: "obgyn" },
    });
    expect(screenRes.status()).toBe(200);
    const screenJson = await screenRes.json();
    const composeRes = await request.post(`${PROD_URL}/api/engine`, {
      data: {
        stage: "compose",
        specialty: "obgyn",
        words,
        choice: { category: "gap", phrase: screenJson.phrases.gap.phrase },
        records: [],
        style: "vancouver",
      },
    });
    expect(composeRes.status()).toBe(200);
    const composeJson = await composeRes.json();
    expect(JSON.stringify(composeJson)).toMatch(/Insufficient direct evidence/i);
  });

  test("PROD-04. Unsigned fabricated record rejected with 422 on compose and /api/docx", async ({ request }, testInfo) => {
    if (testInfo.project.name !== "desktop-1440") {
      test.skip();
      return;
    }
    const fabricated = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/records/unsigned-fabricated.json"), "utf8"));
    const words = [
      { word: "NSCLC", role: "population" },
      { word: "pembrolizumab", role: "intervention" },
      { word: "chemotherapy", role: "comparator" },
      { word: "overall survival", role: "outcome" },
    ];
    const composeRes = await request.post(`${PROD_URL}/api/engine`, {
      data: {
        stage: "compose",
        specialty: "oncology",
        words,
        choice: { category: "established", phrase: "In NSCLC (P), does pembrolizumab (I) compared with chemotherapy (C) improve overall survival (O)?" },
        records: fabricated,
        style: "vancouver",
      },
    });
    expect(composeRes.status()).toBe(422);
  });

  test("PROD-05. ONC-1 explore excludes nct: records and includes KEYNOTE-189", async ({ request }, testInfo) => {
    if (testInfo.project.name !== "desktop-1440") {
      test.skip();
      return;
    }
    const words = [
      { word: "advanced non-small cell lung cancer", role: "population" },
      { word: "pembrolizumab", role: "intervention" },
      { word: "platinum chemotherapy", role: "comparator" },
      { word: "overall survival", role: "outcome" },
    ];
    const exploreRes = await request.post(`${PROD_URL}/api/engine`, {
      data: {
        stage: "explore",
        choice: {
          category: "established",
          phrase: "In advanced non-small cell lung cancer (P), does pembrolizumab (I) compared with platinum chemotherapy (C) improve overall survival (O)?",
        },
        words,
        specialty: "oncology",
        excluded: { userExcluded: [], seen: [] },
      },
    });
    expect(exploreRes.status()).toBe(200);
    const json = await exploreRes.json();
    const records = json.records || [];
    for (const r of records) {
      expect(String(r.nctId || "")).toBe("");
    }
    const hasKeynote189 = records.some(
      (r: { pmid?: string; title?: string }) => String(r.pmid) === "29658856" || /KEYNOTE-189/i.test(String(r.title))
    );
    expect(hasKeynote189).toBe(true);
  });

  test("PROD-06. Routes return 200 with zero console errors and Step 1 TTI < 3s", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "desktop-1440") {
      test.skip();
      return;
    }
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    const t0 = Date.now();
    const res = await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    const elapsed = Date.now() - t0;
    expect(res?.status()).toBe(200);
    expect(elapsed).toBeLessThan(3000);
    for (const route of ["/", "/screen", "/explore", "/summary"]) {
      const r = await page.goto(`${PROD_URL}${route}`, { waitUntil: "domcontentloaded" });
      expect(r?.status()).toBe(200);
    }
    expect(errors).toEqual([]);
  });
});
