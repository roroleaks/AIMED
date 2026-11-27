import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ALL_PRESETS } from "../contract/specialties";
import { mockEngineWithFixtures } from "../_helpers/mock-api";

/**
 * Evaluation sweep (not part of the pass/fail suites): walks every preset of every
 * specialty through Steps 1-4 with recorded fixtures and records layout and logic
 * findings. Findings are printed as "EVAL|{json}" lines and saved under eval-out/.
 * Run with: npm run test:eval
 */
const OUT = path.join(process.cwd(), "eval-out");

const BAD_TEXT = /\b(undefined|NaN|null)\b|\[object|lorem ipsum|TODO|\{\{|\}\}|\$\{/i;

async function pageFindings(page: import("@playwright/test").Page) {
  return page.evaluate((badSrc) => {
    const bad = new RegExp(badSrc, "i");
    const issues: string[] = [];
    const vis = (el: Element) => {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const docW = document.documentElement.scrollWidth;
    if (docW > window.innerWidth + 1) issues.push(`h-overflow ${docW}>${window.innerWidth}`);
    let clipped = 0;
    let tiny = 0;
    let offscreen = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!vis(el)) continue;
      const st = getComputedStyle(el);
      const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 2);
      if (!direct) continue;
      if (parseFloat(st.fontSize) < 12) tiny++;
      if ((st.overflow === "hidden" || st.overflowX === "hidden" || st.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2 && st.whiteSpace !== "normal") clipped++;
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 2 || r.left < -2) offscreen++;
    }
    if (clipped) issues.push(`clipped-text x${clipped}`);
    if (tiny) issues.push(`font<12px x${tiny}`);
    if (offscreen) issues.push(`offscreen-text x${offscreen}`);
    const text = document.body.innerText;
    const m = text.match(bad);
    if (m) issues.push(`bad-token "${m[0]}"`);
    return { issues, text: text.slice(0, 60000) };
  }, BAD_TEXT.source);
}

for (const entry of ALL_PRESETS) {
  test(`EVAL ${entry.specialtyId}/${entry.preset.id}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const proj = testInfo.project.name;
    if (proj !== "desktop-1440" && proj !== "mobile-390") { test.skip(); return; }
    fs.mkdirSync(OUT, { recursive: true });
    const rec: Record<string, unknown> = { specialty: entry.specialtyId, preset: entry.preset.id, project: proj, steps: {} };
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 120)));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 120)); });
    const steps = rec.steps as Record<string, unknown>;
    const shot = async (name: string) => {
      if (entry.preset === entry.preset && (entry.preset.id === ALL_PRESETS.find((p) => p.specialtyId === entry.specialtyId)!.preset.id)) {
        await page.screenshot({ path: path.join(OUT, `${entry.specialtyId}-${proj}-${name}.png`), fullPage: true });
      }
    };
    try {
      await mockEngineWithFixtures(page);
      await page.goto("/");
      await page.locator("#specialty-dropdown-select").selectOption(entry.specialtyId);
      await page.getByRole("button", { name: /Proceed to Clinical Dashboard/i }).click();
      await page.waitForURL(/\/dashboard/);
      await page.locator(`[data-testid="preset-card"][data-preset-id="${entry.preset.id}"]`).click();
      const f1 = await pageFindings(page);
      steps.dashboard = { issues: f1.issues };
      await shot("1-dashboard");

      await page.getByTestId("save-and-screen").click();
      await page.waitForURL(/\/screen/);
      await page.getByTestId("focus-card").first().waitFor({ timeout: 30_000 });
      const cards = await page.getByTestId("focus-card").evaluateAll((els) => els.map((e) => ({
        cat: e.getAttribute("data-category"), avail: e.getAttribute("data-available"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 400),
      })));
      const f2 = await pageFindings(page);
      steps.screen = { issues: f2.issues, cards: cards.map((c) => ({ cat: c.cat, avail: c.avail, phrase: c.text.slice(0, 220) })), availableCount: cards.filter((c) => c.avail === "true").length };
      await shot("2-screen");

      const avail = page.locator('[data-testid="focus-card"][data-available="true"]').first();
      if ((await avail.count()) > 0) await avail.getByTestId("choose-focus").click();
      else await page.getByTestId("focus-card").first().getByTestId("choose-focus").click();
      await page.getByRole("button", { name: /Continue to Explorer/i }).click();
      await page.waitForURL(/\/explore/);
      await page.getByTestId("paper-card").first().waitFor({ timeout: 30_000 }).catch(() => {});
      const papers = await page.getByTestId("paper-card").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 160)));
      const f3 = await pageFindings(page);
      const iTerms = entry.preset.raw.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean).flatMap((t) => t.split(/\s+/)).filter((w) => w.length > 4);
      const overlap = papers.filter((p) => iTerms.some((t) => p.toLowerCase().includes(t))).length;
      steps.explore = { issues: f3.issues, papers: papers.length, relevantByTerm: overlap };
      await shot("3-explore");

      await page.getByTestId("next-summary").first().click();
      await page.waitForURL(/\/summary/);
      await page.getByTestId("manuscript").waitFor({ timeout: 30_000 });
      const f4 = await pageFindings(page);
      const ms = await page.getByTestId("manuscript").evaluate((el) => ({
        sections: el.querySelectorAll("section").length,
        words: (el as HTMLElement).innerText.split(/\s+/).length,
        text: (el as HTMLElement).innerText,
      }));
      const refs = await page.getByTestId("references").innerText();
      const refCount = (refs.match(/^\s*\d+[.)]/gm) || []).length;
      const sentences = ms.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 60);
      const dup = sentences.length - new Set(sentences).size;
      const titleEl = await page.locator("h1, h2").allInnerTexts();
      steps.summary = { issues: f4.issues, sections: ms.sections, words: ms.words, refCount, duplicateSentences: dup, headings: titleEl.slice(0, 4).map((t) => t.slice(0, 160)) };
      await shot("4-summary");
    } catch (e) {
      rec.fatal = String((e as Error).message).slice(0, 300);
    }
    rec.errors = Array.from(new Set(errors)).slice(0, 5);
    console.log("EVAL|" + JSON.stringify(rec));
    fs.writeFileSync(path.join(OUT, `${entry.specialtyId}-${entry.preset.id}-${proj}.json`), JSON.stringify(rec, null, 2));
  });
}
