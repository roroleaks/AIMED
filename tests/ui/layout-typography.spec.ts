import { test, expect } from "@playwright/test";
import { DESIGN } from "../contract/design-contract";
import { seedWorkflowToSummary } from "../_helpers/mock-api";

const ROUTES = ["/", "/dashboard", "/screen", "/explore", "/summary"] as const;

test.describe("L6 Layout, Typography, and Spacing", () => {
  for (const route of ROUTES) {
    test(`UI-GLOBAL-${route === "/" ? "portal" : route.slice(1)}. Typography, overflow, width, touch targets, and rhythm`, async ({ page }, testInfo) => {
      if (route === "/screen" || route === "/explore" || route === "/summary") {
        await seedWorkflowToSummary(page, "ONC-1");
      }
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);

      const viewport = page.viewportSize()!;
      const isMobile = viewport.width < 640;

      const audit = await page.evaluate(
        ({ DESIGN, isMobile, route }) => {
          const issues: string[] = [];

          const isVisible = (el: Element) => {
            const st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };

          // UI-T01: primaryFont on visible elements & controls
          const primaryLower = DESIGN.primaryFont.toLowerCase();
          const allEls = Array.from(document.querySelectorAll("body *")).filter(isVisible);
          for (const el of allEls) {
            const ff = getComputedStyle(el).fontFamily;
            const firstFamily = ff.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
            if (DESIGN.forbiddenFonts.some((f) => firstFamily === f.toLowerCase())) {
              issues.push(`UI-T01 forbidden first font "${firstFamily}" on <${el.tagName.toLowerCase()}>`);
              break;
            }
            if (!firstFamily.includes(primaryLower)) {
              issues.push(`UI-T01 expected "${DESIGN.primaryFont}" first font, got "${firstFamily}" on <${el.tagName.toLowerCase()}>`);
              break;
            }
          }

          // UI-T02 & UI-T03: font sizes & weights on visible text nodes
          const distinctSizes = new Set<number>();
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (!node.textContent?.trim()) continue;
            const el = node.parentElement;
            if (!el || !isVisible(el)) continue;
            const st = getComputedStyle(el);
            const fs = Math.round(parseFloat(st.fontSize) * 10) / 10;
            distinctSizes.add(Math.round(fs));
            if (fs < DESIGN.minFontPx - 0.5) {
              issues.push(`UI-T02 text below ${DESIGN.minFontPx}px (${fs}px): "${node.textContent.trim().slice(0, 30)}"`);
            }
            const allowed = DESIGN.fontSizesPx.some((s) => Math.abs(s - fs) <= 0.6);
            if (!allowed) {
              issues.push(`UI-T02 non-scale font size ${fs}px on <${el.tagName.toLowerCase()}>`);
            }
            const fw = parseInt(st.fontWeight, 10);
            if (![400, 500, 600, 700].includes(fw)) {
              issues.push(`UI-T03 disallowed font-weight ${fw} on <${el.tagName.toLowerCase()}>`);
            }
            // UI-T14: uppercase only on <= 12px
            if (st.textTransform === "uppercase" && fs > 12.5) {
              issues.push(`UI-T14 uppercase on ${fs}px (>12px) text`);
            }
          }
          if (distinctSizes.size > DESIGN.maxDistinctFontSizesPerRoute) {
            issues.push(`UI-T02 too many distinct font sizes (${distinctSizes.size} > ${DESIGN.maxDistinctFontSizesPerRoute})`);
          }

          // UI-T05: no horizontal page overflow
          if (document.documentElement.scrollWidth > window.innerWidth + 1) {
            issues.push(`UI-T05 horizontal overflow: scrollWidth=${document.documentElement.scrollWidth} > innerWidth=${window.innerWidth}`);
          }

          // UI-T07: reading width <= 780px at >= 1280
          if (window.innerWidth >= 1280) {
            for (const p of Array.from(document.querySelectorAll("p, .variant-card p, [data-testid='manuscript'] p")).filter(isVisible)) {
              const w = p.getBoundingClientRect().width;
              if (w > DESIGN.readingMaxPx + 1) {
                issues.push(`UI-T07 prose paragraph width ${Math.round(w)}px > ${DESIGN.readingMaxPx}px`);
                break;
              }
            }
          }

          // UI-T08: main container <= 1120px
          const mainEl = document.querySelector("main");
          if (mainEl) {
            const mw = mainEl.getBoundingClientRect().width;
            if (mw > DESIGN.contentMaxPx + 1) {
              issues.push(`UI-T08 main width ${Math.round(mw)}px > ${DESIGN.contentMaxPx}px`);
            }
          }

          // UI-T09: touch target sizes
          const minTouch = isMobile ? DESIGN.minTouchTargetPx.mobile : DESIGN.minTouchTargetPx.desktop;
          for (const ctrl of Array.from(document.querySelectorAll("button, a, select, input, textarea")).filter(isVisible)) {
            const r = ctrl.getBoundingClientRect();
            if (r.width < minTouch - 1 || r.height < minTouch - 1) {
              issues.push(`UI-T09 interactive element <${ctrl.tagName.toLowerCase()}> (${Math.round(r.width)}x${Math.round(r.height)}) < ${minTouch}px`);
              break;
            }
          }

          // UI-T10: single primary button & accent color
          const primaries = Array.from(document.querySelectorAll(".btn--primary")).filter(isVisible);
          for (const btn of primaries) {
            const bg = getComputedStyle(btn).backgroundColor;
            if (bg !== DESIGN.accent) {
              issues.push(`UI-T12 primary button bg "${bg}" !== "${DESIGN.accent}"`);
              break;
            }
          }

          // UI-T15: header height <= 72px on Steps 2-4 at >= 1024
          if (["/screen", "/explore", "/summary"].includes(route) && window.innerWidth >= 1024) {
            const hdr = document.querySelector("[data-testid='app-header']");
            if (hdr && hdr.getBoundingClientRect().height > 73) {
              issues.push(`UI-T15 compact header height ${Math.round(hdr.getBoundingClientRect().height)}px > 72px`);
            }
          }

          // UI-T16: draft banner on Steps 2-4
          if (["/screen", "/explore", "/summary"].includes(route)) {
            const banner = document.querySelector("[data-testid='draft-banner']");
            if (!banner || !isVisible(banner)) {
              issues.push("UI-T16 missing visible draft-banner on Step 2-4");
            }
          }

          return issues;
        },
        { DESIGN, isMobile, route }
      );

      expect(audit, `UI audit issues on ${route} (${testInfo.project.name}):\n${audit.join("\n")}`).toEqual([]);
    });
  }
});
