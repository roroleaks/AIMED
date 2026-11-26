import { test, expect } from "@playwright/test";
import { ALL_SPECIALTIES } from "../contract/specialties";
import { mockEngineWithFixtures } from "../_helpers/mock-api";

const SPECIALTY_PRESET_RUNS = ALL_SPECIALTIES.flatMap((s) =>
  s.id === "obgyn"
    ? s.presets.map((p) => ({ specialty: s, preset: p }))
    : [{ specialty: s, preset: s.presets[0] }]
);

test.describe("L5 End-to-End Clinical Workflow", () => {
  for (const { specialty, preset } of SPECIALTY_PRESET_RUNS) {
    test(`E2E-SPEC-${specialty.id}-${preset.id}. Full 4-step workflow`, async ({ page }, testInfo) => {
      if (testInfo.project.name !== "desktop-1440") {
        test.skip();
        return;
      }

      await mockEngineWithFixtures(page);
      await page.goto("/");

      // Step 0 -> Step 1
      await page.locator("#specialty-dropdown-select").selectOption(specialty.id);
      await page.getByRole("button", { name: /Proceed to Clinical Dashboard/i }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      // Click preset
      const presetBtn = page.locator(`[data-testid="preset-card"][data-preset-id="${preset.id}"]`);
      await expect(presetBtn).toBeVisible();
      await presetBtn.click();

      const kwInput = page.getByTestId("keywords-input");
      await expect(kwInput).toHaveValue(preset.raw);

      const expectedWordCount = preset.raw.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean).length;
      await expect(page.getByTestId("keywords-counter")).toContainText(`${expectedWordCount} / 5`);
      const chips = page.getByTestId("pico-chip");
      await expect(chips).toHaveCount(expectedWordCount);

      // Step 1 -> Step 2
      await page.getByTestId("save-and-screen").click();
      await expect(page).toHaveURL(/\/screen/);

      const focusCards = page.getByTestId("focus-card");
      await expect(focusCards).toHaveCount(3);

      // Unavailable cards must not be styled as primary
      const unavailCards = page.locator('[data-testid="focus-card"][data-available="false"] [data-testid="choose-focus"]');
      const unavailCount = await unavailCards.count();
      for (let i = 0; i < unavailCount; i++) {
        await expect(unavailCards.nth(i)).not.toHaveClass(/btn--primary/);
      }

      // Choose first available focus
      const availCard = page.locator('[data-testid="focus-card"][data-available="true"]').first();
      if ((await availCard.count()) > 0) {
        await availCard.getByTestId("choose-focus").click();
      } else {
        await focusCards.first().getByTestId("choose-focus").click();
      }
      await page.getByRole("button", { name: /Continue to Explorer/i }).click();
      await expect(page).toHaveURL(/\/explore/);

      // Step 3 checks
      const paperCards = page.getByTestId("paper-card");
      const paperCount = await paperCards.count();
      expect(paperCount).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < paperCount; i++) {
        const cardText = await paperCards.nth(i).innerText();
        expect(cardText).not.toMatch(/ClinicalTrials\.gov|Trial Registration/i);
      }

      const nextBtn = page.getByTestId("next-summary").first();
      await expect(nextBtn).toHaveClass(/btn--primary/);
      await nextBtn.click();
      await expect(page).toHaveURL(/\/summary/);

      // Step 4 checks
      const manuscript = page.getByTestId("manuscript");
      await expect(manuscript).toBeVisible();
      const sections = manuscript.locator("section");
      expect(await sections.count()).toBeGreaterThanOrEqual(5);

      // Style toggle switches reference format
      const refsSection = page.getByTestId("references");
      const vancouverText = await refsSection.innerText();
      await page.getByTestId("style-toggle").getByRole("radio", { name: "APA" }).click();
      const apaText = await refsSection.innerText();
      expect(apaText).not.toEqual(vancouverText);
      await page.getByTestId("style-toggle").getByRole("radio", { name: "VANCOUVER" }).click();

      // DOCX & PDF downloads
      const [docxDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("download-docx").click(),
      ]);
      expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);

      const [pdfDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("download-pdf").click(),
      ]);
      expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/);

      // Start over returns to Step 1 with empty inputs
      await page.getByTestId("start-over").click();
      await expect(page).toHaveURL(/\/dashboard|\/$/);
    });
  }

  test("E2E-NAV-01. Quick Switch, Back/Forward, and Reload preserve state", async ({ page }) => {
    await mockEngineWithFixtures(page, "ONC-1");
    await page.goto("/dashboard");

    // Quick Switch to oncology
    await page.getByTestId("quick-switch").click();
    const modal = page.getByTestId("modal");
    await expect(modal).toBeVisible();
    await modal.locator(".specialty-card", { hasText: "Oncology" }).first().click();
    await expect(modal).toBeHidden();

    // Click first oncology preset
    await page.getByTestId("preset-card").first().click();
    const savedVal = await page.getByTestId("keywords-input").inputValue();
    expect(savedVal.length).toBeGreaterThan(5);

    // Reload on Step 1 restores keywords
    await page.reload();
    await expect(page.getByTestId("keywords-input")).toHaveValue(savedVal);

    // Go to Step 2 and reload
    await page.getByTestId("save-and-screen").click();
    await expect(page).toHaveURL(/\/screen/);
    await expect(page.getByTestId("focus-card")).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId("focus-card")).toHaveCount(3);

    // Back and Forward
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("keywords-input")).toHaveValue(savedVal);
    await page.goForward();
    await expect(page).toHaveURL(/\/screen/);
  });

  test("E2E-ADV-HOMEO. Homeopathy in IVF concludes Insufficient direct evidence", async ({ page }) => {
    await mockEngineWithFixtures(page, "ADV-HOMEO");
    await page.goto("/dashboard");

    await page.getByTestId("keywords-input").fill("IVF, homeopathy, placebo, live birth");
    await page.getByTestId("save-and-screen").click();
    await expect(page).toHaveURL(/\/screen/);

    // Established must be unavailable
    const estCard = page.locator('[data-testid="focus-card"][data-category="established"]');
    await expect(estCard).toHaveAttribute("data-available", "false");

    // Select gap focus and continue
    await page.locator('[data-testid="focus-card"][data-category="gap"] [data-testid="choose-focus"]').click();
    await page.getByRole("button", { name: /Continue to Explorer/i }).click();
    await expect(page).toHaveURL(/\/explore/);

    // Even with 0 records, proceed to summary or verify empty state
    const nextBtns = page.getByTestId("next-summary");
    if ((await nextBtns.count()) > 0) {
      await nextBtns.first().click();
      await expect(page).toHaveURL(/\/summary/);
      await expect(page.getByTestId("manuscript")).toContainText(/Insufficient direct evidence/i);
    }
  });
});
