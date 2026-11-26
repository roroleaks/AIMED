export const DESIGN = {
  primaryFont: process.env.AIMED_PRIMARY_FONT ?? "Inter",
  forbiddenFonts: ["Arial", "Times New Roman", "Helvetica"],
  fontSizesPx: [12, 13, 14, 16, 17, 20, 24, 28],
  minFontPx: 12,
  maxDistinctFontSizesPerRoute: 10,
  spacingScalePx: [0, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64],
  radiiPx: [6, 10, 14, 999, 9999],
  controlHeightsPx: { sm: 32, md: 40, lg: 48 },
  minTouchTargetPx: { desktop: 24, mobile: 44 },
  readingMaxPx: 780,
  contentMaxPx: 1120,
  accent: "rgb(15, 118, 110)",
  brand: "AIMed",
} as const;

export const EXPECTED_SPECIALTY_COUNT = 15;
