---
description: Mandatory development protocol for AIMed - mobile-first edits, full test suite verification, and zip snapshot generation
globs: ["**/*"]
always_on: true
---

# AIMed Mandatory Development Workflow

This is a **fixed rule** governing all edits, feature additions, bug fixes, and refactoring on the AIMed codebase:

## 1. Mobile Interface First-Class Parity
- **Every UI or workflow edit MUST be simultaneously implemented and styled for mobile screens** (< 768px and < 480px viewports).
- Ensure:
  - Responsive layout stacking (no horizontal overflows or clipped modals).
  - Touch-friendly tap targets ($\ge 44 \times 44\text{px}$ where applicable, minimum padding on buttons).
  - Compact cards, readable typography (`1rem` / `0.95rem` on mobile, scaling hero headers).
  - Fluid specialty selectors, category filters (horizontal scrolling or touch wrap), and step indicators.
  - Full usability across desktop, tablet, and mobile handsets.

## 2. Full Test Suite Verification
- Before finishing any turn or delivering changes, run the complete suite:
  - `npm test`: Run all unit tests across all libraries (`src/lib/*.test.ts`).
  - `npm run typecheck`: TypeScript compilation check.
  - `npm run build`: Production Next.js build verification.
  - Multi-specialty verification suite: `node scripts/test-all-specialties.mjs` ensuring all 15 clinical domains pass 100%.

## 3. Final Zip Snapshot Update
- After verifying changes and before completion, always create and update the clean project snapshot:
  - Run `npm run snapshot` (executes `node scripts/create-snapshot.mjs`).
  - Target: `C:\Users\raouf.RAOUFDESKTOP\.gemini\antigravity\scratch\aimed-snapshot.zip`.
  - Staged zip must exclude `node_modules`, `.next`, `.git`, `.vercel`.
