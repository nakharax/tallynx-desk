# TallyNX Desk — Complete Section Architecture Reorganization

- **Date:** 2026-11-26
- **Branch:** `refactor/desk-section-architecture`
- **Target:** `desk.tallynx.com` (`active-projects/tallynx-desk`)
- **Status:** Approved by user

---

## 1. Goals & Visual Design Principles

1. **Workflow-First Information Architecture:** Organize the entire workspace around the trader's real daily sequence:
   `Desk (Live Command) → Plan (Pre-Trade & Chart) → Quant (Market & AI Risk) → Review (Autopsy & Journal) → Rules (Prop Rules & News)`
   with a separated **Secondary Rail** at the bottom of the desktop sidebar (`Mall` and `Settings`).
2. **Eliminate Vertical Bloat:** Every page has a focused primary job with clean horizontal sub-tabs where needed — no more stacking 4 heavy vertical cards (`Live 3s` + `KPI` + `Autopsy` + `Charts`, or `TradingView` + `AI Risk` + `COMEX Bridge`, or monolithic `Settings`) on one endless scroll.
3. **Balanced Card Sizing & Grid Rhythm:**
   - Cards must feel balanced — neither cramped/tiny nor oversized/sprawling.
   - Standardize section container rhythm (`max-width: 1440px` centered inside `main.container` where appropriate, consistent `gap: 16px`, balanced card padding `18px 20px`, KPI grid `repeat(4, minmax(0, 1fr))` on desktop → 2x2 on tablet → 1-col/2-col clean wrap on mobile).
   - Balanced 2-column grids (`minmax(0, 1.35fr) minmax(320px, 1fr)` or `repeat(2, minmax(0, 1fr))`) so no card stretches across ultra-wide whitespace or collapses too narrow.
4. **Hard Visual Constraints:**
   - **Zero colored card header/edge accent stripes** (`border-top`, `border-left`, `::before` colored bars). All cards use clean neutral `1px solid var(--border-color)` borders.
   - **Desk Home (`desk.tallynx.com/`) is `Desk` (`sec-accounts`), never `Mall`.**
   - **100% Non-Custodial & Legal Safe Harbor** (Zero trade signals, pass `node scripts/ci-policy-guard.mjs`).
   - **Zero new npm dependencies.**

---

## 2. Navigation & Section Map

### Desktop Left Sidebar (`WorkspaceSidebar.tsx`)
- **Primary Trading Workflow (Top Group):**
  1. `desk` (`Desk` / `หน้าหลัก`) → default section `sec-accounts`
  2. `plan` (`Plan` / `วางแผน`) → default section `tv-chart-root`
  3. `quant` (`Quant` / `ควอนต์`) → default section `sec-quant-risk`
  4. `review` (`Review` / `รีวิว`) → default section `sec-review-autopsy`
  5. `rules` (`Rules` / `กฎกองทุน`) → default section `sec-proprules`
- **Divider (`<div className="fx-sidebar-divider" />`) + Secondary Rail (Lower Group):**
  6. `mall` (`Mall` / `มอลล์`) → default section `sec-mall`
  7. `settings` (`Settings` / `ตั้งค่า`) → default section `sec-settings`

### Mobile Bottom Navigation (`MobileBottomNav.tsx`)
- 5 compact buttons that never crowd on `375px`:
  1. `Desk` (`sec-accounts`)
  2. `Plan` (`tv-chart-root`)
  3. `Quant` (`sec-quant-risk`)
  4. `Review` (`sec-review-autopsy`)
  5. `More` (opens a clean compact popover/sheet above the bottom nav with 3 items: `Rules` (`sec-proprules`), `Mall` (`sec-mall`), `Settings` (`sec-settings`), and shows active state when any of those 3 pillars is active).

### Sub-Tabs & Section Ownership (`pillarSubtabs`)

| Pillar | Sub-Tabs (`sectionId`) | Contents |
| :--- | :--- | :--- |
| **`desk`** | *(none — single crisp command screen)* | **Compact Command Center (`sec-accounts`):** Live 3s Cockpit (`LivePositionMonitorCard`), 4-KPI Band, compact Equity/Risk & Performance/Calendar/Account view (with `PropAutopsyCard` moved OUT to `Review`), plus a concise Prop Guard & Next Red-Folder News summary card with 1-click jump to `Rules`. |
| **`plan`** | `Live Chart` (`tv-chart-root`) · `3-TP Calc` (`calculator-root`) · `12-Gate` (`desk-cards-root`) | **Pure Pre-Trade Execution Prep:** `TradingViewChartSection` renders ONLY the TradingView chart + live telemetry strip (no stacked AI Risk or COMEX Bridge beneath it). `3-TP Calc` and `12-Gate` stay crisp and balanced. |
| **`quant`** | `AI Risk` (`sec-quant-risk`) · `COMEX Bridge` (`sec-comex-bridge`) | **Dedicated Quant & Market Lab:** Full-width balanced workspace for `AiRiskSupervisionCard` (in `sec-quant-risk`) and `ComexBridgePanel` (in `sec-comex-bridge`). Architecture cleanly accommodates future Slice 4 (`Sentiment`) as a 3rd tab. |
| **`review`** | `Autopsy` (`sec-review-autopsy`) · `Journal` (`journal-root`) | **Post-Trade Review & Diagnostics:** `PropAutopsyCard` + account diagnostic summary in `sec-review-autopsy` (balanced 2-column/centered layout), and full `TradeJournalSection` in `journal-root`. Cleanly accommodates future Slice 3 (`Trade Replay`). |
| **`rules`** | *(none, or internal Prop Rules / News Radar clean layout)* | `PropRulesSection` with balanced card grid (Prop Firm Rules + News Blackout Radar). |
| **`mall`** | `Mall Lounge` (`sec-mall`) · `Strategy Market` (`sec-marketplace`) | Existing Mall Lounge & Strategy Market, visually separated below the sidebar divider. |
| **`settings`** | Internal 4-tab switcher inside `sec-settings`: `Display` · `AI & Keys` · `Accounts` · `Sync` | Breaks up the vertical Settings wall into 4 clean, balanced tabbed panels (`Display`, `AI & Data Keys` (`AiAndDataKeysCard`), `Accounts`, `Cloud Sync & MT5`). |

---

## 3. Clean Path URLs & Backward Compatibility (`src/utils/webHandoff.ts`)

Canonical paths:
- `/desk` → `sec-accounts` (also `/` on `desk.tallynx.com`)
- `/chart` → `tv-chart-root`
- `/calc` → `sec-calc` (`calculator-root`)
- `/gate` → `desk-cards-root`
- `/quant` → `sec-quant-risk`
- `/comex` → `sec-comex-bridge`
- `/review` → `sec-review-autopsy`
- `/journal` → `journal-root`
- `/rules` → `sec-proprules`
- `/mall` → `sec-mall`
- `/market` → `sec-market` (`sec-marketplace`)
- `/settings` → `sec-settings`

Backward-compatible aliases MUST continue resolving cleanly:
- `/analysis`, `/portfolio` → `sec-accounts`
- `/plan` → `tv-chart-root`
- `/ai-risk` → `sec-quant-risk`
- `/autopsy` → `sec-review-autopsy`
- `/proprules` → `sec-proprules`
- `/community` → `sec-mall`
- `/marketplace` → `sec-market`

Update `src/utils/webHandoff.test.ts` to cover all new canonical routes and legacy aliases.

---

## 4. Command Palette, Smoke Test & Verification Gate

- Update `CommandPalette` / quick navigation items (if present) so all 7 zones & new sub-pages (`Quant · AI Risk`, `Quant · COMEX Bridge`, `Review · Autopsy`, `Settings · AI & Keys`) are searchable via `Ctrl/Cmd+K`.
- Update `scripts/responsive-smoke.py` to test the new workflow navigation across all 5 viewports (`375px`, `768px`, `820px`, `960px`, `1024px`) — including `Desk`, `Plan` (`Live Chart` / `3-TP Calc` / `12-Gate`), `Quant` (`AI Risk` / `COMEX Bridge`), `Review` (`Autopsy` / `Journal`), `Rules`, `Mall`, and `Settings` (switching all 4 tabs), with zero horizontal overflow, zero topbar overlap, and zero `.live-cockpit` crushing.
- All verification gates must pass before opening PR:
  1. `npm run lint`
  2. `npx tsx --test src/utils/*.test.ts`
  3. `node scripts/ci-policy-guard.mjs`
  4. `npm run build`
