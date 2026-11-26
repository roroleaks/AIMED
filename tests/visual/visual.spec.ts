import { test, expect } from "@playwright/test";
import { ALL_SPECIALTIES } from "../contract/specialties";
import { seedWorkflowToSummary } from "../_helpers/mock-api";

const VISUAL_VIEWPORTS = new Set(["desktop-1440", "tablet-1024", "tablet-768", "mobile-390"]);

test.describe("L8 Visual Regression Baselines", () => {
  test("VIS-PORTAL. Portal home screenshot", async ({ page }, testInfo) => {
    if (!VISUAL_VIEWPORTS.has(testInfo.project.name)) {
      test.skip();
      return;
    }
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`portal-${testInfo.project.name}.png`, {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      fullPage: true,
    });
  });

  for (const spec of ALL_SPECIALTIES) {
    test(`VIS-DASH-${spec.id}. Dashboard preset area`, async ({ page }, testInfo) => {
      if (!VISUAL_VIEWPORTS.has(testInfo.project.name)) {
        test.skip();
        return;
      }
      await page.goto("/");
      await page.evaluate((id) => {
        sessionStorage.setItem("aimed_specialty", JSON.stringify(id));
      }, spec.id);
      await page.goto("/dashboard");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByTestId("preset-grid")).toHaveScreenshot(
        `presets-${spec.id}-${testInfo.project.name}.png`,
        {
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
        }
      );
    });
  }

  for (const route of ["/screen", "/explore", "/summary"] as const) {
    test(`VIS-STEP-${route.slice(1)}. Step view with ONC-1`, async ({ page }, testInfo) => {
      if (!["desktop-1440", "mobile-390"].includes(testInfo.project.name)) {
        test.skip();
        return;
      }
      await seedWorkflowToSummary(page, "ONC-1");
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`step-${route.slice(1)}-${testInfo.project.name}.png`, {
        maxDiffPixelRatio: 0.01,
        animations: "disabled",
      });
    });
  }

  test("VIS-MODALS. Specialty and Sources modals", async ({ page }, testInfo) => {
    if (!["desktop-1440", "mobile-390"].includes(testInfo.project.name)) {
      test.skip();
      return;
    }
    await page.goto("/dashboard");
    await page.evaluate(() => document.fonts.ready);

    await page.getByTestId("quick-switch").click();
    await expect(page.getByTestId("modal")).toHaveScreenshot(`modal-specialty-${testInfo.project.name}.png`, {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /View sources/i }).click();
    await expect(page.getByTestId("modal")).toHaveScreenshot(`modal-sources-${testInfo.project.name}.png`, {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });
});
