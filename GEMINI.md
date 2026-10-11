# AIMed Project Rules & Directives

## Mandatory Workflow Rules (Fixed Protocol)

From now on, every task, edit, or feature in AIMed must strictly follow this 3-step cycle:

1. **Mobile Interface Co-editing**:
   - Every edit must be applied to both the desktop and mobile interfaces.
   - Test and refine CSS breakpoints (`@media (max-width: 768px)` and `@media (max-width: 480px)`).
   - Ensure touch-friendly buttons, responsive card grids, fluid typography, and zero horizontal scrolling on mobile viewports.

2. **Full Test Suite Execution**:
   - Run unit tests: `npm test`
   - Run typecheck: `npm run typecheck`
   - Run production build: `npm run build`
   - Run multi-specialty verification: `node scripts/test-all-specialties.mjs` (all 15 specialties must pass 100%).

3. **Final Zip Snapshot Update**:
   - Update the distribution snapshot after every edit: `npm run snapshot`.
   - Snapshot location: `C:\Users\raouf.RAOUFDESKTOP\.gemini\antigravity\scratch\aimed-snapshot.zip`.
