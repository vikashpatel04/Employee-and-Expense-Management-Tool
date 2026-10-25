# Design

All UI design lives in **Claude Design**, in one place.

**FinCrew Design System:** https://claude.ai/artifact/8jzomFcfJazHfn6yiUFQQP
(Design System artifact, private to the owner's claude.ai account; share from the page's
Share menu.) First version 2026-10-23.

## How a session reads it

Use the Artifact tool, not a web fetch:

1. `read` with `url` above and `path: "project/README.md"`. Start here: principles, voice,
   colour, type, spacing, icons, how to use the components.
2. `project/tokens.json` is the **source of truth** for tokens (colour light/dark, both app
   accents, type, spacing, radius, elevation, sizes). Phase 3 generates `packages/ui` from it.
3. Components: `project/components/<Name>/README.md` (guidelines) and `preview.html`; the bundle is
   `project/components/bundle.js` (`window.FinCrewUI`, React 18).
4. To change the system, follow the instructions the artifact's type returns on `read`
   (revise only the files you change; the index `project/design-system.json` goes last).

## What's in it (v1)

- **Accents:** FinCrew "Peacock" `#0B5D6B` (dark `#5CC6D2`), white text. Staffora "Marigold"
  `#F2A30F` (dark `#FFBA3D`), always dark ink text. Components only use `accent*` tokens;
  `AppScope app="staffora"` swaps them.
- **Neutrals:** cool grey-green (`canvas` `#F1F3F0` / `#0C1013`, `surface`, `ink`, `line`…).
- **Statuses** (one colour + icon + word everywhere): present (green, check), half_day (olive,
  half circle), absent (red, x), paid_leave (blue, umbrella), unpaid_leave (violet, struck
  umbrella), weekly_off (slate, moon), holiday (plum, sparkle), late (amber, clock), unmarked
  (dashed).
- **Money:** owed amber "Due", paid green, advance blue, deductions muted with a minus (never
  red). ₹ with Indian grouping, tabular figures, paise at half size on hero amounts.
- **Type:** Anek Latin / Tamil / Devanagari (Google Fonts, one design in three scripts).
- **Sizes:** 4px spacing base; tap targets 48 / 56 / 72px; six radii; three elevations.
- **22 components:** AppScope, Icon (38 icons), Button, StatusPill, LateBadge, Money
  (`formatPaise`, `groupIndian`, `amountInWords`), Avatar, StaffRow, SummaryChip, AmountInput,
  CodeDisplay, CodePad, BottomTabBar, SegmentedControl, BottomSheet, StatusPicker, CalendarCell,
  MonthCalendar, LedgerLine, PayslipLine, ListSection, EmptyState.
- **Reference pages:** all statuses, English/Tamil/Hindi sample, app icons.
- **Assets:** app icon concepts (FinCrew "Ledger F" lead, "Rupee ring"; Staffora "Checked-in"
  lead, "Staff badge"), nine status icon SVGs.
- **App icons in use** (owner's choice, 2026-10-25): FinCrew **B · Rupee ring**, Staffora
  **B · Staff badge**. The SVGs are copied to `packages/ui/design/app-icons/`; `pnpm ui:icons`
  (`scripts/app-icons.mjs`, sharp) makes every PNG from them: each Expo app's icon, Android
  adaptive background / foreground (mark inside the safe zone) / monochrome, splash mark and
  favicon, and the website's `src/app/icon.svg` + `apple-icon.png`. Change the SVGs, rerun.

## Key screens (Design artifacts, 2026-10-23)

- **FinCrew key screens:** https://claude.ai/artifact/WydRUvQzCNMAoXcNVh7pWC (Android light + dark:
  Today, status sheet, shop switcher, Attendance code, Staff detail tabs, Salary run draft/final,
  Add expense, Money · expenses / salary / advances with the give-advance sheet (added
  2026-10-24, x 5640–6580 in the light row), Requests with the approve sheet (x 7050); web: attendance grid (pinned names and totals), salary review table, dashboard,
  attendance on a phone (day view), expenses with the add panel, reports — the last four added
  2026-10-24; then attendance code, requests and the staff sign-in card, x 8070–11110)
- **Staffora key screens:** https://claude.ai/artifact/9YMxty5q9jFvuut8ay8dTe (Home before/after
  check-in, Scan QR, Enter code incl. wrong code, Checked in, Money ledger/payslips; light + dark;
  "Join · first run", "PIN to open", "Attendance" and "Ask for leave / advance, my requests"
  added 2026-10-24)
- Reviewed by the owner (2026-10-23). Change made from their comment: Attendance code now has
  **Show QR** instead of Copy code, plus a new artboard "Attendance code · QR" (full-screen QR
  view).

**Design-system gaps found while designing** (to add to the system): tokens.css not served (now
generated in `packages/ui`); dark-mode switching (now `[data-theme]` + media query in tokens.css);
no type classes (now `.text-*` in tokens.css); no warning/settings icons or expense-category
icons/colours; missing components (banner, shop switcher, neutral tag, date/month switcher,
key-value row, stat tile, text input/select/checkbox/time field, selectable card, web sidebar/
table/grid cell/bulk toolbar, camera viewfinder, sheet header/footer); limits (CodeDisplay's copy button can't be swapped for Show QR, so that screen lays out the
code card itself; Button as link,
LedgerLine kinds, tappable MonthCalendar days, display-only SummaryChip, CodePad states).

## packages/ui

`packages/ui/design/tokens.json` is a snapshot of the system's `project/tokens.json`. To refresh:
Artifact `read` the design system with `path: "project/tokens.json"`, copy it over the snapshot,
run `pnpm ui:tokens`. That generates `src/tokens.generated.ts` (resolved `themes` per app and
theme, sizes, text styles) and `src/tokens.css` (variables, dark mode, `.app-staffora`, `.text-*`).
CI fails if the generated files are stale.

## Still to design

Phase 3 is done (system, key screens, `packages/ui`). Later screens are designed in the same
canvases when needed: settings screens (built on 2026-10-24 from existing web patterns; artboards
still to add: leave templates, holidays, rules, roles), advances,
expenses, Staffora requests. Fill the design-system gaps listed above as screens need them.

## How the website uses it

- `apps/fincrew-web` imports `@fincrew/ui/tokens.css` (colours light/dark, sizes, `.text-*`
  styles) and loads Anek Latin with `next/font`. Icons: Lucide.
- **Since 2026-10-25 the website uses shadcn/ui** (owner's request) themed by the tokens:
  `apps/fincrew-web/src/app/globals.css` maps shadcn's colour names onto the token variables
  and gives the tokens denser **web sizes** (36 px controls, 10 px corners, smaller titles).
  New website UI uses `src/components/ui` (shadcn) and `src/components/app` (FormDialog,
  PendingLink, TabLinks, skeletons); tasks open in dialogs, not as cards in the page. See
  `docs/features/fincrew-web.md` → "Look and feel".
- Web screens follow the canvases' "Web ·" artboards; Android screens will follow the phone
  artboards (Phase 5) using `themes` from `@fincrew/ui`.
- Owner rule overrides the design voice: **dates are DD/MM/YYYY** everywhere.

## Notes for code

- The design system's `formatPaise` must agree with `packages/core` `formatINR` (Indian
  grouping, half-up rounding rules). `packages/core` is the source of truth for money logic;
  `packages/ui` should call it, not re-implement it.
- Status keys match the database values in PLAN §4.3; `unmarked` is UI-only.
