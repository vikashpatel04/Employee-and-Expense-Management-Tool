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

## Still to design (Phase 3)

Key screens as **Design** artifacts built on this system (PLAN §7): Today, Attendance code,
Staff detail, Salary run, Add expense, Staffora Home, Scan and Enter code. Then generate
`packages/ui` from `tokens.json` (TypeScript theme for web and React Native; `AppScope` becomes
a theme provider).

## Notes for code

- The design system's `formatPaise` must agree with `packages/core` `formatINR` (Indian
  grouping, half-up rounding rules). `packages/core` is the source of truth for money logic;
  `packages/ui` should call it, not re-implement it.
- Status keys match the database values in PLAN §4.3; `unmarked` is UI-only.
