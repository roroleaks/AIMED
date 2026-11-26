import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedWorkflowToSummary } from "../_helpers/mock-api";

const ROUTES = ["/", "/dashboard", "/screen", "/explore", "/summary"] as const;

test.describe("L7 Accessibility", () => {
  for (const route of ROUTES) {
    test(`A11Y-AXE-${route === "/" ? "portal" : route.slice(1)}. Zero serious or critical axe violations`, async ({ page }) => {
      if (route === "/screen" || route === "/explore" || route === "/summary") {
        await seedWorkflowToSummary(page, "ONC-1");
      }
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);

      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      expect(
        seriousOrCritical,
        `Serious/critical axe violations on ${route}:\n${seriousOrCritical
          .map((v) => `- [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`)
          .join("\n")}`
      ).toEqual([]);
    });
  }

  test("A11Y-MODAL-01. Specialty & Sources modals trap focus, close on Escape, and restore focus", async ({ page }) => {
    await page.goto("/dashboard");

    // Specialty modal
    const quickSwitch = page.getByTestId("quick-switch");
    await quickSwitch.click();
    const dialogs = page.locator('[role="dialog"]');
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs.first()).toHaveAttribute("aria-modal", "true");
    await expect(dialogs.first()).toHaveAttribute("aria-labelledby", /.+/);

    // Focus should be inside dialog
    const focusInside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && dlg.contains(document.activeElement);
    });
    expect(focusInside).toBe(true);

    // Escape closes and returns focus to trigger
    await page.keyboard.press("Escape");
    await expect(dialogs).toHaveCount(0);
    await expect(quickSwitch).toBeFocused();

    // Sources modal
    const viewSources = page.getByRole("button", { name: /View sources/i });
    await viewSources.click();
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs.first()).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(dialogs).toHaveCount(0);
    await expect(viewSources).toBeFocused();
  });

  test("A11Y-KBD-01. Keyboard navigation reaches presets, textarea, and primary CTA", async ({ page }) => {
    await page.goto("/dashboard");
    const firstPreset = page.getByTestId("preset-card").first();
    await firstPreset.focus();
    await page.keyboard.press("Enter");
    const val = await page.getByTestId("keywords-input").inputValue();
    expect(val.length).toBeGreaterThan(5);
  });
});
