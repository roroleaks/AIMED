import { test, expect } from "@playwright/test";
import { ALL_SPECIALTIES } from "../contract/specialties";
import { DESIGN } from "../contract/design-contract";

test.describe("L6 Clinical Presets Matrix (15 Specialties × Viewports)", () => {
  for (const spec of ALL_SPECIALTIES) {
    test(`UI-P-${spec.id}. Presets layout, columns, alignment, and interaction`, async ({ page }, testInfo) => {
      await page.goto("/");
      await page.evaluate((id) => {
        sessionStorage.setItem("aimed_specialty", JSON.stringify(id));
      }, spec.id);
      await page.goto("/dashboard");
      await page.evaluate(() => document.fonts.ready);

      const viewport = page.viewportSize()!;
      const grid = page.getByTestId("preset-grid");
      await expect(grid).toBeVisible();

      const cards = grid.getByTestId("preset-card");
      // UI-P01: exact preset count (no slice(0,3) truncation)
      await expect(cards).toHaveCount(spec.presets.length);

      const metrics = await page.evaluate(
        ({ expectedCount, vw, primaryFont }) => {
          const issues: string[] = [];
          const gridEl = document.querySelector('[data-testid="preset-grid"]') as HTMLElement;
          const kwEl = document.querySelector('[data-testid="keywords-input"]') as HTMLElement;
          const cardEls = Array.from(gridEl.querySelectorAll('[data-testid="preset-card"]')) as HTMLElement[];

          // UI-P06: left edge alignment
          if (Math.abs(gridEl.getBoundingClientRect().left - kwEl.getBoundingClientRect().left) > 1.5) {
            issues.push(`UI-P06 grid left (${gridEl.getBoundingClientRect().left}) != input left (${kwEl.getBoundingClientRect().left})`);
          }

          const rects = cardEls.map((el) => el.getBoundingClientRect());
          const minHeight = vw <= 390 ? 56 : 48;

          for (let i = 0; i < cardEls.length; i++) {
            const el = cardEls[i];
            const r = rects[i];
            const st = getComputedStyle(el);
            const firstFont = st.fontFamily.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
            if (!firstFont.includes(primaryFont.toLowerCase())) {
              issues.push(`UI-P02 card ${i} font "${firstFont}" != ${primaryFont}`);
            }
            if (r.height < minHeight - 1) {
              issues.push(`UI-P02 card ${i} height ${Math.round(r.height)}px < ${minHeight}px`);
            }
            if (parseFloat(st.paddingTop) < 11.5 || parseFloat(st.paddingBottom) < 11.5) {
              issues.push(`UI-P02 card ${i} vertical padding < 12px`);
            }
            if (Math.round(parseFloat(st.borderRadius)) !== 10) {
              issues.push(`UI-P02 card ${i} radius ${st.borderRadius} != 10px`);
            }
            if (el.scrollWidth > el.clientWidth + 1) {
              issues.push(`UI-P07 card ${i} horizontal text overflow`);
            }
          }

          // UI-P04: column count by viewport
          const distinctLefts = Array.from(new Set(rects.map((r) => Math.round(r.left))));
          const expectedCols =
            vw >= 1024 ? (expectedCount === 2 ? 2 : expectedCount === 3 ? 3 : 2) : vw >= 640 ? 2 : 1;
          if (distinctLefts.length !== expectedCols) {
            issues.push(`UI-P04 expected ${expectedCols} columns at ${vw}px for ${expectedCount} presets, got ${distinctLefts.length}`);
          }

          // UI-P12: odd preset count in 2-column layout must not leave an empty cell
          if (expectedCount % 2 === 1 && distinctLefts.length === 2 && rects.length >= 2) {
            const lastRect = rects[rects.length - 1];
            const firstRect = rects[0];
            if (lastRect.width < firstRect.width * 1.5) {
              issues.push(
                `UI-P12 odd preset count (${expectedCount}) in 2-column layout at ${vw}px leaves an empty cell (last card width ${Math.round(lastRect.width)}px vs ${Math.round(firstRect.width)}px)`
              );
            }
          }

          // UI-P11: no word inside a preset card may split mid-word
          for (let i = 0; i < cardEls.length; i++) {
            const walker = document.createTreeWalker(cardEls[i], NodeFilter.SHOW_TEXT);
            let tNode: Node | null;
            while ((tNode = walker.nextNode())) {
              const txt = tNode.textContent || "";
              const re = /\S+/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(txt)) !== null) {
                const range = document.createRange();
                range.setStart(tNode, m.index);
                range.setEnd(tNode, m.index + m[0].length);
                const clientRects = Array.from(range.getClientRects());
                const distinctTops = new Set(clientRects.map((cr) => Math.round(cr.top)));
                if (distinctTops.size > 1 && !m[0].includes("-")) {
                  issues.push(`UI-P11 word "${m[0]}" split mid-word across lines in card ${i} at ${vw}px`);
                }
              }
            }
          }

          // UI-P03 & UI-P08: gap >= 12px between cards
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i];
              const b = rects[j];
              const sameRow = Math.abs(a.top - b.top) < 5;
              if (sameRow) {
                const hGap = Math.max(b.left - a.right, a.left - b.right);
                if (hGap < 11.5) {
                  issues.push(`UI-P03/P08 horizontal gap ${Math.round(hGap)}px < 12px`);
                }
                // UI-P05: equal heights in row
                if (Math.abs(a.height - b.height) > 1.5) {
                  issues.push(`UI-P05 unequal row heights ${Math.round(a.height)}px vs ${Math.round(b.height)}px`);
                }
              }
            }
          }

          return issues;
        },
        { expectedCount: spec.presets.length, vw: viewport.width, primaryFont: DESIGN.primaryFont }
      );

      expect(metrics, `Preset matrix issues for ${spec.id} (${testInfo.project.name}):\n${metrics.join("\n")}`).toEqual([]);

      // UI-P11 at 640px (run alongside tablet-768 project)
      if (testInfo.project.name === "tablet-768") {
        await page.setViewportSize({ width: 640, height: 800 });
        const split640 = await page.evaluate(() => {
          const issues: string[] = [];
          const cardEls = Array.from(document.querySelectorAll('[data-testid="preset-card"]')) as HTMLElement[];
          for (let i = 0; i < cardEls.length; i++) {
            const walker = document.createTreeWalker(cardEls[i], NodeFilter.SHOW_TEXT);
            let tNode: Node | null;
            while ((tNode = walker.nextNode())) {
              const txt = tNode.textContent || "";
              const re = /\S+/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(txt)) !== null) {
                const range = document.createRange();
                range.setStart(tNode, m.index);
                range.setEnd(tNode, m.index + m[0].length);
                const distinctTops = new Set(Array.from(range.getClientRects()).map((cr) => Math.round(cr.top)));
                if (distinctTops.size > 1 && !m[0].includes("-")) {
                  issues.push(`UI-P11 word "${m[0]}" split mid-word across lines in card ${i} at 640px`);
                }
              }
            }
          }
          return issues;
        });
        expect(split640, `UI-P11 mid-word split at 640px for ${spec.id}`).toEqual([]);
      }

      // UI-P13: keywords placeholder must be specialty-specific (no endometriosis outside obgyn)
      const placeholder = (await page.getByTestId("keywords-input").getAttribute("placeholder")) ?? "";
      if (spec.id !== "obgyn") {
        expect(placeholder, `UI-P13 placeholder for ${spec.id} must not use endometriosis`).not.toMatch(/endometriosis/i);
      }

      // UI-P09 & UI-P10: click first preset sets aria-pressed=true and fills preset.raw
      const firstCard = cards.first();
      await firstCard.click();
      await expect(firstCard).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("keywords-input")).toHaveValue(spec.presets[0].raw);
    });
  }
});
