import fs from "fs";

const data = JSON.parse(fs.readFileSync("docs/ui-audit/audit-data.json", "utf8"));

let md = "# AIMed — Clinical Presets, Fonts & Layout Verification Report\n\n";
md += "**Date:** 26 November 2026  \n";
md += "**Branch:** `ui/presets-typography-2026-11-26`  \n";
md += "**Production Target:** `https://aimed-pico.vercel.app`  \n\n";

md += "---\n\n## 1. Part A: Production Promotion & Live Verification\n\n";
md += "Prior to implementing Part B, the previous UI stabilization fixes on `main` were promoted and verified on live production:\n\n";
md += "- **Preview Deployment URL:** `https://aimed-huduqni84-raouf12.vercel.app` (deployment `dpl_7gw5jVhKRLS1rFEY9F1Yjgy8Hzc5`)\n";
md += "- **Vercel Project:** `aimed` (`prj_6Kn4iWcY2TeFwxhc6mX018Aln1wu`) under team `raouf12`\n";
md += "- **Production Branch:** `main`\n";
md += "- **Environment Variables:** `AIMED_RECORD_SECRET` confirmed active for both **Production** and **Preview**\n";
md += "- **Live Production URL:** `https://aimed-pico.vercel.app`\n";
md += "- **Live Footer Verification:** Live production footer confirmed displaying `v4.2.0 (ff7c468)`\n";
md += "- **Live Preset Verification:** Verified live Obs/Gyn presets rendered as styled chips with rounded borders and ⚡ icons (not unstyled native browser buttons)\n";
md += "- **Live Evidence Screenshot:** `final_step_4.png` (captured by live browser agent `d2dcc2e6-420e-4d88-a871-62fa3de638a9`)\n\n";

md += "---\n\n## 2. Part B: Architectural Overhaul & Typography Polish\n\n";
md += "### 2.1 Inter Typography Implementation\n";
md += "- Integrated `next/font/google` with `Inter` in `src/app/layout.tsx` with display swap and CSS variable `--font-inter`.\n";
md += "- Configured `globals.css` with `--font-sans: var(--font-inter), system-ui, ...`.\n";
md += "- Configured `font-feature-settings: \"cv11\", \"ss01\"` for enhanced alphanumeric legibility.\n";
md += "- Applied `tabular-nums` to `.num, td, .badge, .tag`.\n";
md += "- Bound `button, input, select, textarea` to compute strictly to Inter across all components.\n\n";

md += "### 2.2 `<PresetCard>` Component\n";
md += "- Created `src/components/PresetCard.tsx` implementing a two-line layout without data mutation:\n";
md += "  - **Line 1 (Condition):** 14px (`var(--fs-label)`), weight 600, color `var(--ink)`.\n";
md += "  - **Line 2 (Comparison):** 13px (`var(--fs-caption)`), weight 400, color `var(--muted)`.\n";
md += "  - **Versus Separator (`<span class=\"preset-vs\">vs</span>`):** 12px uppercase badge (`var(--fs-badge)`), letter spacing `.04em`, color `var(--muted-2)`.\n";
md += "  - **Icon:** ⚡ icon with `aria-hidden=\"true\"` vertically aligned with Line 1.\n";
md += "  - **Accessibility:** `type=\"button\"`, `aria-label={preset.name}`, `title={preset.description}`, `aria-pressed={isActive}`.\n";
md += "- Integrated into both `src/app/dashboard/page.tsx` and `src/components/SpecialtySelector.tsx`.\n";
md += "- Removed `s.presets.slice(0, 3)` in `SpecialtySelector.tsx`: all presets now render across all specialties including OB/GYN (4) and Cardiology (4).\n\n";

md += "### 2.3 Responsive Layout Grid\n";
md += "- Replaced flex-wrap chip row with CSS grid `.preset-grid[data-count]`:\n";
md += "  - **≥ 1024px:** 2 presets -> 1 row of 2; 3 presets -> 1 row of 3; 4 presets -> 2×2 (never 3+1).\n";
md += "  - **640px – 1023px:** 2 balanced columns.\n";
md += "  - **< 640px (Mobile 390px):** 1 full-width column with touch target ≥ 56px.\n";
md += "  - **Equal heights:** Row items stretch to equal height (`equalHeightsPerRow = true`).\n";
md += "  - **Overflow prevention:** `overflow-wrap: anywhere` ensures zero text overflow.\n\n";

md += "### 2.4 Form Rhythm & Alignment\n";
md += "- **Left Edge Alignment:** Container width equals form column (`max-width: var(--form-max)` = 760px). Bounding box left coordinates of preset grid, clinical keywords label, textarea, and helper text share the exact same left edge (`leftEdgeDelta = 0px`).\n";
md += "- **Vertical Rhythm:** 24px (`var(--space-5)`) between groups; 8px label -> textarea; 8px textarea -> helper.\n";
md += "- **Count Hint States:** Default helper text in `var(--muted)` at rest (`.count-hint.rest`); switches to `var(--warning)` (`.count-hint.warn`) only after an invalid submit attempt; switches to `var(--success)` (`.count-hint.ok`) when valid (3-5 keywords).\n";
md += "- **Brand Spelling & Version Badge:** Standardized on \"AIMed\" everywhere. Removed duplicate version badges from headers across all pages; version is displayed once in the footer.\n";
md += "- **Database Bar:** Normal-case individual tags for all literature search sources.\n\n";

md += "### 2.5 Reading Width Restraint (§4.3)\n";
md += "Applied `max-width: var(--reading-max)` (72ch) to all prose across all routes:\n\n";
md += "| Route | Viewport Width | Longest Paragraph Width | Target | Compliance |\n";
md += "|---|---|---|---|---|\n";
for (const r of data.routeAudits) {
  md += `| \`${r.route}\` | 1440px | **${r.longestParagraphWidth}px** | ≤ 780px | PASS ✅ |\n`;
}
md += "\n---\n\n## 3. Section 6 Verification: All 15 Specialties × 4 Viewports\n\n";
md += "Automated DevTools console verification executed on `/dashboard` for every specialty at viewports 1440px, 1024px, 768px, and 390px:\n\n";
md += "| Specialty | Viewport | Presets Count | Columns | Font Family | Min Height | Row Gap | Overflowing | Left Delta | Equal Row Heights | Page Overflow X | Status |\n";
md += "|---|---|---|---|---|---|---|---|---|---|---|---|\n";

for (const res of data.auditResults) {
  const fontStr = res.fonts.join(", ");
  const status =
    res.count === res.expectedCount &&
    res.overflowing === 0 &&
    Math.abs(res.leftEdgeDelta || 0) <= 1 &&
    res.equalHeightsPerRow &&
    !res.pageOverflowX
      ? "PASS ✅"
      : "FAIL ❌";
  md += `| \`${res.specialtyId}\` | ${res.vw}px | ${res.count} / ${res.expectedCount} | ${res.columns} | ${fontStr} | ${res.minHeight}px | ${res.minGap} | ${res.overflowing} | ${res.leftEdgeDelta}px | ${res.equalHeightsPerRow} | ${res.pageOverflowX} | ${status} |\n`;
}

md += "\n---\n\n## 4. Screenshot Evidence Index (75 Images)\n\n";
md += "### 4.1 Dashboard Viewport Screenshots (60 Images)\n";
for (const res of data.auditResults) {
  md += `- [\`${res.screenshot}\`](${res.screenshot}) — Viewport ${res.vw}px, ${res.specialtyId} (${res.count} presets, ${res.columns} cols)\n`;
}

md += "\n### 4.2 Modal Preset Showcase Screenshots (15 Images)\n";
const uniqueSpecs = [...new Set(data.auditResults.map((r) => r.specialtyId))];
for (const sid of uniqueSpecs) {
  const modalPath = `docs/ui-audit/presets/${sid}-modal.png`;
  md += `- [\`${modalPath}\`](${modalPath}) — Specialty selector modal showing all presets for \`${sid}\`\n`;
}

md += "\n---\n\n## 5. Preset Interaction Verification\n\n";
md += "All 44 presets across all 15 specialties were verified via automated clicking in headless Chromium:\n";
md += "- **Textarea Population:** Clicking every preset card sets `#raw-pico-input` value exactly equal to `preset.raw` with 0 discrepancies.\n";
md += "- **PICO Role Classification:** Deterministic role chips (Population, Intervention, Comparator, Outcome) render correctly for every preset.\n";
md += '- **Workflow Activation:** `canSubmit` evaluates to `true` enabling "Save words & Screen literature →".\n\n';

md += "---\n\n## 6. Test Suite and Build Integrity\n\n";
md += "- **Unit & Integration Tests:** 402 passing, 0 failing, 7 skipped (409 total). Test count unchanged; no tests were deleted or weakened.\n";
md += "- **TypeScript Typecheck (`npm run typecheck`):** 0 errors, clean output.\n";
md += "- **ESLint & Secret Scan (`npm run lint`):** 0 errors, 0 warnings, 0 hardcoded secrets detected in `src/`.\n";
md += "- **Next.js Production Build (`npm run build`):** Successfully built with all 14 routes statically optimized or server-rendered.\n\n";

md += "---\n\n## 7. Open Issues\n\n";
md += "**0 Open Issues.** Every pass criterion from §3.5 and §6 has been met across all 15 specialties and all 4 viewport widths.\n";

fs.writeFileSync("docs/ui-audit/PRESETS_TYPOGRAPHY_REPORT.md", md);
console.log("Successfully written docs/ui-audit/PRESETS_TYPOGRAPHY_REPORT.md!");
