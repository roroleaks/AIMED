import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/raouf.RAOUFDESKTOP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Portal
  await page.goto("http://localhost:3456/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const portalP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/", width: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Portal:", portalP);

  // 2. Dashboard
  await page.goto("http://localhost:3456/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".preset-card");
  await page.waitForTimeout(500);
  const dashP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/dashboard", width: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Dashboard:", dashP);

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
    return { route: "/screen", width: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Screen:", screenP);

  // 4. Explore
  const chooseBtn = page.locator("button:has-text('Choose this focus')").first();
  await chooseBtn.click();
  await page.waitForTimeout(300);
  const continueBtn = page.locator("button:has-text('Continue to Explorer')");
  await continueBtn.click();
  await page.waitForURL("**/explore", { timeout: 15000 });
  await page.waitForSelector("main p", { timeout: 15000 });
  await page.waitForTimeout(800);

  const exploreP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/explore", width: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Explore:", exploreP);

  // 5. Summary
  const summaryBtn = page.locator("button:has-text('Next: Workflow summary')").first();
  await summaryBtn.click();
  await page.waitForURL("**/summary", { timeout: 15000 });
  await page.waitForSelector("main p", { timeout: 15000 });
  await page.waitForTimeout(800);

  const summaryP = await page.evaluate(() => {
    const p = [...document.querySelectorAll("main p")].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return { route: "/summary", width: p ? Math.round(p.getBoundingClientRect().width) : null, text: p?.innerText.slice(0, 40) };
  });
  console.log("Summary:", summaryP);

  await browser.close();
}

run().catch(console.error);
