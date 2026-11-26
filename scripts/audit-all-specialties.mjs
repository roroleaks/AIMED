import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/raouf.RAOUFDESKTOP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
import fs from "fs";
import path from "path";

const SPECIALTIES = [
  { id: "obgyn", name: "Obstetrics & Gynecology", count: 4 },
  { id: "cardiology", name: "Cardiology & Vascular Medicine", count: 4 },
  { id: "oncology", name: "Medical Oncology", count: 3 },
  { id: "pediatrics", name: "Pediatrics & Neonatology", count: 3 },
  { id: "surgery", name: "General & Minimally Invasive Surgery", count: 3 },
  { id: "internal_med", name: "Internal Medicine & Nephrology", count: 2 },
  { id: "neurology", name: "Neurology & Neurovascular", count: 2 },
  { id: "endocrinology", name: "Endocrinology & Metabolism", count: 2 },
  { id: "emergency_med", name: "Emergency Medicine & Critical Care", count: 3 },
  { id: "psychiatry", name: "Psychiatry & Behavioral Health", count: 3 },
  { id: "orthopedics", name: "Orthopedic Surgery & Sports Medicine", count: 3 },
  { id: "pulmonology", name: "Pulmonology & Respiratory Medicine", count: 3 },
  { id: "gastroenterology", name: "Gastroenterology & Hepatology", count: 3 },
  { id: "infectious_disease", name: "Infectious Diseases & Antimicrobial Stewardship", count: 3 },
  { id: "dermatology", name: "Dermatology & Cutaneous Biology", count: 3 },
];

const WIDTHS = [1440, 1024, 768, 390];

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const auditDir = path.resolve("docs/ui-audit/presets");
  fs.mkdirSync(auditDir, { recursive: true });

  const auditResults = [];

  console.log("Starting audit of all 15 specialties across 4 viewports...");

  for (const s of SPECIALTIES) {
    console.log(`\n=== Specialty: ${s.id} (${s.count} presets) ===`);

    // Navigate and set specialty in sessionStorage
    await page.goto("http://localhost:3456/dashboard", { waitUntil: "networkidle" });
    await page.evaluate((specId) => {
      sessionStorage.setItem("aimed_specialty", JSON.stringify(specId));
      sessionStorage.removeItem("aimed_pico_words");
      sessionStorage.removeItem("aimed_input_text");
    }, s.id);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".preset-grid");

    for (const width of WIDTHS) {
      const height = width === 390 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);

      // §6 Verification snippet
      const result = await page.evaluate(() => {
        const grid = document.querySelector(".preset-grid");
        const cards = [...document.querySelectorAll(".preset-card")];
        const ta = document.querySelector("#raw-pico-input");
        const rect = (e) => e.getBoundingClientRect();
        const cols = new Set(cards.map((c) => Math.round(rect(c).left))).size;
        return {
          specialty: (document.querySelector("[class*=domain] strong, h2, .active-domain")?.innerText || "").slice(0, 40),
          vw: innerWidth,
          count: cards.length,
          columns: cols,
          fonts: [...new Set(cards.map((c) => getComputedStyle(c).fontFamily.split(",")[0].trim().replace(/['"]/g, "")))],
          minHeight: Math.min(...cards.map((c) => Math.round(rect(c).height))),
          minGap: getComputedStyle(grid).rowGap,
          overflowing: cards.filter((c) => c.scrollWidth > c.clientWidth).length,
          leftEdgeDelta: grid && ta ? Math.round(rect(grid).left - rect(ta).left) : null,
          equalHeightsPerRow: (() => {
            const rows = {};
            cards.forEach((c) => {
              const t = Math.round(rect(c).top);
              (rows[t] ||= []).push(Math.round(rect(c).height));
            });
            return Object.values(rows).every((r) => new Set(r).size === 1);
          })(),
          pageOverflowX: document.documentElement.scrollWidth > innerWidth,
          bodyFont: getComputedStyle(document.body).fontFamily.split(",")[0].trim().replace(/['"]/g, ""),
          buttonFonts: [
            ...new Set(
              [...document.querySelectorAll("button,select,input,textarea")].map((e) =>
                getComputedStyle(e).fontFamily.split(",")[0].trim().replace(/['"]/g, "")
              )
            ),
          ],
        };
      });

      // Capture screenshot
      const shotPath = path.join(auditDir, `${s.id}-${width}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      console.log(
        `[${s.id}] @ ${width}px: count=${result.count}, cols=${result.columns}, minH=${result.minHeight}px, leftDelta=${result.leftEdgeDelta}px, eqHeight=${result.equalHeightsPerRow}, ovf=${result.overflowing}`
      );

      auditResults.push({
        specialtyId: s.id,
        expectedCount: s.count,
        ...result,
        screenshot: `docs/ui-audit/presets/${s.id}-${width}.png`,
      });
    }

    // Modal screenshot at 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    const quickSwitchBtn = page.locator("#btn-choose-speciality");
    if (await quickSwitchBtn.isVisible()) {
      await quickSwitchBtn.click();
      await page.waitForSelector("[role='dialog']", { timeout: 3000 });
      await page.waitForTimeout(300);
      const modalShotPath = path.join(auditDir, `${s.id}-modal.png`);
      await page.screenshot({ path: modalShotPath, fullPage: false });
      console.log(`[${s.id}] Captured modal screenshot`);
      // Close modal
      const closeBtn = page.locator("[role='dialog'] button:has-text('Close')");
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(200);
      }
    }
  }

  // Check 5 routes at 1440 for longestParagraphWidth
  console.log("\n=== Checking longestParagraphWidth across all 5 routes at 1440px ===");
  await page.setViewportSize({ width: 1440, height: 900 });

  const routeAudits = [];

  // Reset to obgyn for workflow verification
  await page.goto("http://localhost:3456/dashboard", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    sessionStorage.setItem("aimed_specialty", JSON.stringify("obgyn"));
    sessionStorage.removeItem("aimed_pico_words");
    sessionStorage.removeItem("aimed_input_text");
    sessionStorage.removeItem("aimed_screen_data");
    sessionStorage.removeItem("aimed_explore_data");
    sessionStorage.removeItem("aimed_summary_choice");
  });

  // 1. Portal
  await page.goto("http://localhost:3456/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const portalP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/", longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Portal:", portalP);
  routeAudits.push(portalP);

  // 2. Dashboard
  await page.goto("http://localhost:3456/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".preset-card");
  await page.waitForTimeout(500);
  const dashP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/dashboard", longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Dashboard:", dashP);
  routeAudits.push(dashP);

  // Click preset
  await page.locator(".preset-card").first().click();
  await page.waitForTimeout(200);

  // 3. Screen
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/screen", { timeout: 10000 });
  await page.waitForSelector("main p", { timeout: 10000 });
  await page.waitForTimeout(800);
  const screenP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/screen", longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Screen:", screenP);
  routeAudits.push(screenP);

  // 4. Explore
  const chooseBtn = page.locator("button:has-text('Choose this focus'):not([aria-disabled='true'])").first();
  await chooseBtn.click();
  await page.waitForTimeout(300);
  const continueBtn = page.locator("button:has-text('Continue to Explorer')");
  await continueBtn.click();
  await page.waitForURL("**/explore", { timeout: 15000 });
  await page.waitForSelector("main p", { timeout: 15000 });
  await page.waitForTimeout(800);
  const exploreP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/explore", longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Explore:", exploreP);
  routeAudits.push(exploreP);

  // 5. Summary
  const summaryBtn = page.locator("button:has-text('Next: Workflow summary')").first();
  await summaryBtn.click();
  await page.waitForURL("**/summary", { timeout: 15000 });
  await page.waitForSelector("main p", { timeout: 15000 });
  await page.waitForTimeout(800);
  const summaryP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/summary", longestParagraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Summary:", summaryP);
  routeAudits.push(summaryP);

  // Save audit data to json
  fs.writeFileSync("docs/ui-audit/audit-data.json", JSON.stringify({ auditResults, routeAudits }, null, 2));
  console.log("\nAudit complete! Saved docs/ui-audit/audit-data.json and screenshots.");

  await browser.close();
}

main().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
