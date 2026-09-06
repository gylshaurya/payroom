---
name: "Payroom"
description: "An invoice running order with exact payment terms and their receipts."
colors:
  ink: "#20243e"
  muted: "#636a80"
  line: "#e3e6ef"
  wash: "#f7f8fc"
  nav: "#191e54"
  accent: "#343f9e"
  selected: "#eef0ff"
  positive: "#256449"
  negative: "#a53141"
  sheet: "#fff"
  focus: "#8c96ed"
  primary-hover: "#323d86"
  secondary-border: "#cbd0e0"
  secondary-hover: "#f0f2fa"
  danger-border: "#debfc4"
  danger-hover: "#fff0f2"
  nav-text: "#d6dbf8"
  nav-hover: "#282f6a"
  nav-active: "#343d85"
  field-border: "#cbd1e0"
  draft-bg: "#eff1f6"
  draft-text: "#535a70"
  approved-bg: "#e9edff"
  approved-text: "#344494"
  paid-bg: "#e6f3ed"
  cancelled-bg: "#f1f1f4"
  cancelled-text: "#696476"
  failed-bg: "#fbecee"
  failed-text: "#a33142"
  pending-bg: "#fff2d9"
  pending-text: "#825613"
typography:
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "28px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-.03em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "19px"
    letterSpacing: "-.025em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "14px"
  body-supporting:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "11px"
    fontWeight: 650
  button:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 650
  amount:
    fontFamily: "Manrope, sans-serif"
    fontSize: "27px"
    fontWeight: 750
    letterSpacing: "-.035em"
rounded:
  badge: "4px"
  field: "5px"
  control: "6px"
  surface: "8px"
spacing:
  compact: "8px"
  field: "10px"
  row-edge: "18px"
  section: "24px"
  panel: "30px"
components:
  button-primary:
    backgroundColor: "{colors.nav}"
    textColor: "{colors.sheet}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.negative}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-text:
    textColor: "{colors.accent}"
    padding: "6px 0"
  field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px"
  navigation-item:
    textColor: "{colors.nav-text}"
    rounded: "{rounded.control}"
    padding: "13px 12px"
  navigation-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.sheet}"
  workbench:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.surface}"
  receipt:
    textColor: "{colors.accent}"
  badge-draft:
    backgroundColor: "{colors.draft-bg}"
    textColor: "{colors.draft-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  badge-approved:
    backgroundColor: "{colors.approved-bg}"
    textColor: "{colors.approved-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  badge-paid:
    backgroundColor: "{colors.paid-bg}"
    textColor: "{colors.positive}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  badge-cancelled:
    backgroundColor: "{colors.cancelled-bg}"
    textColor: "{colors.cancelled-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  badge-failed:
    backgroundColor: "{colors.failed-bg}"
    textColor: "{colors.failed-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
  badge-pending:
    backgroundColor: "{colors.pending-bg}"
    textColor: "{colors.pending-text}"
    rounded: "{rounded.badge}"
    padding: "4px 7px"
---

# Design System: Payroom

## Overview

**Creative North Star: "Broadcast running order"**

Deep indigo framing, cool white working sheets and compact rows give Payroom the character of an operator's desk. The selected request and its exact terms share a visual context with the receipt. Manrope carries both labels and amounts; alignment and explicit status text do the organizational work.

The direction is candidate 7, seed `0544fe78`, composition A. This scan documents the implemented interface in `public/style.css`, `public/index.html` and `public/app.js`, following the ship disposition in the finish verdict. That verdict covers the local design; it does not establish live sponsor execution. Product language remains plain and local execution disclosures remain visible.

**Key Characteristics:**
- Indigo navigation framing a light working surface.
- Compact rows with a selected-item inspector.
- Flat sheets, fine separators and small corner radii.
- Explicit status labels and readable, wrapping receipt metadata.

## Colors

The palette combines cool indigo with quiet blue-grey neutrals; green, rose and amber distinguish transaction states.

### Primary
- **Navigation indigo (`nav`):** rail and primary action background.
- **Action indigo (`accent`):** text actions, links and receipt disclosures.
- **Selection wash (`selected`):** the current invoice row, independently of payment status.

### Secondary
- **Paid green (`positive`, `paid-bg`):** paid invoices and confirmed operations.
- **Cancellation action rose (`negative`):** destructive-action text. Failed operations use the separate `failed-text` and `failed-bg` pair.
- **Pending amber (`pending-text`, `pending-bg`):** operation state awaiting a result.

### Neutral
- **Ink (`ink`):** primary text and exact amounts.
- **Muted (`muted`):** explanatory copy, dates and secondary metadata.
- **Wash (`wash`):** application canvas behind white sheets.
- **Sheet (`sheet`):** workbench, fields and secondary buttons.
- **Line (`line`):** sheet outlines and internal separators.
- **Draft and cancelled pairs:** subdued labels distinct from confirmed and failed operations.

**The Separate Signals Rule.** Selection identifies the item under review; a labelled badge identifies its state. Do not substitute selection color for payment status.

## Typography

**Display and body font:** self-hosted Manrope, with sans-serif fallback. The variable font supports weights from 200 to 800 and uses swap loading. There is no separate display or monospace family; addresses also use Manrope.

The hierarchy stays compact: the page heading uses `headline`, section headings use `title`, and supporting paragraphs use `body-supporting`. Invoice headings are slightly smaller (17px); page titles reduce on phones (25px). Table headers are small on desktop (10px), while the final phone rules raise them (11px). Phone invoice references and amounts use readable row text (12px), with contributor subtitles (11px).

Amounts use tabular numerals in both the list and inspector. The inspector amount uses the `amount` role, with a smaller muted currency suffix (12px). Addresses and receipt values wrap rather than truncate; their phone text rises to 11px. Supporting text in payment controls is limited to 65ch.

**The Exact Amount Rule.** Preserve tabular alignment and a visible currency label. Long addresses belong in wrapping detail text, not an ellipsis-only receipt.

## Layout

The desktop shell is a sticky, full-height rail (220px) beside flexible main content with padding (35px 36px 20px). The header pairs the page title with actions; filters and search sit above the working sheet. The workbench uses a flexible invoice column with a minimum (370px) and an inspector (340px), with a minimum height (610px). These are the implemented measurements recorded by the direction contract.

At widths from 1500px, main padding expands (40px 48px), the invoice minimum grows (500px), and the inspector grows (390px) with padding (30px). At 1190px and below, the rail narrows (184px), the inspector becomes 305px, and the list hides the due column. At 900px and below, the rail narrows again (166px) and the inspector stacks below the list. The due column returns at this breakpoint; payment controls become one column.

At 600px and below, the rail becomes a static top band with horizontal navigation and an explicit local-environment line. Main side gutters are 16px; search fills the available width, the due column hides again, and the inspector remains below the queue. Navigation targets have a minimum height (44px); filter targets have a minimum height (40px). Activity timestamps occupy their own row. The final phone overrides in the stylesheet are authoritative where earlier phone rules differ.

Payment controls use two bordered columns on desktop; activity entries use a timestamp, main content and state column. Neither establishes a reusable dashboard-tile layout. Spacing uses compact inline gaps alongside the section rhythm in the frontmatter; do not treat the extracted steps as a complete mathematical scale.

## Elevation & Depth

The system uses no box shadows. Indigo framing, white sheets, subtle selection fills and thin borders establish depth. Keyboard focus is a solid outline (3px) with an offset (3px); the search wrapper has its own lighter focus-within outline and offset (2px). Keep those focus indications distinct from surface elevation.

**The Flat Sheet Rule.** Separate content with borders and tonal changes. The current material system does not use floating card shadows.

## Shapes

Working sheets use the `surface` radius, buttons and navigation use `control`, fields and filters use `field`, and badges use `badge`. The phone workbench has a slightly smaller radius (7px). All remain compact rectangles; only the small environment dot is circular. Rows are continuous parts of a table with horizontal separators, not individual rounded cards. Icons are inline outline SVGs, normally 20px with a stroke width of 1.6.

## Components

### Buttons

Compact, clearly labelled rectangles. Primary actions use navigation indigo and white text; secondary actions use a white background with an outlined edge; danger actions use rose text and a muted rose border. Their canonical padding and radius are in the frontmatter; the desktop minimum height is 40px. Hover changes the background over 0.16s with ease-out. Text actions have no filled container and underline on hover. Disabled buttons use opacity (0.55) and a wait cursor; no separate pressed animation is implemented. Keyboard focus uses the global visible outline.

### Navigation

A vertical icon-and-label stack within the indigo rail. The active route has a lighter indigo fill and white label; hover uses its separate darker fill. The application sets `aria-current` on the active route. On phones, navigation becomes horizontal and the local execution disclosure appears directly beneath it.

### Chips and filters

State badges are small, noninteractive rectangles with explicit Draft, Approved, Paid, Cancelled, Failed or Pending labels. Confirmed operations share the paid treatment. Filters are buttons with counts and an `aria-pressed` state. Active filters use a pale indigo fill and border; they do not inherit badge meaning.

### Cards / Containers

The workbench is a shared white sheet with a border and internal divider, not a grid of freestanding cards. Inspector padding is 24px by default. Controls and activity use the same white bordered surface; controls use 30px padding, while activity rows use 20px 24px. Consult Layout for their responsive changes.

### Inputs / Fields

White fields with a cool border, small corners, 10px padding and 12px text. Labels sit above fields with helper text below. Textareas resize vertically and start at a minimum height (75px). Search is an icon-and-input wrapper with a focus-within outline. Native validation handles required inputs; the interface has no custom field-error visual variant. Operation errors appear in a separate notice.

### Invoice inspector and receipts

The inspector presents reference and status, then work description, exact amount, due information, recipient, payment action or receipt, and the invoice record. Sections are divided by a fine top border. Receipt disclosures use native details/summary elements, indigo labels and wrapping definition-list values. Confirmed payment receipts open initially. The desktop entrance uses a short horizontal clip reveal (0.2s, cubic-bezier(.16,1,.3,1)). Reduced-motion preference removes animations and transitions; invoice selection also avoids smooth scrolling under that preference.

### Notices and pending strip

Ordinary notices use a cool tinted border and background; errors use rose. A pending receipt produces an amber strip with an explanatory sentence and a Check receipt action. On phones the action stacks beneath the explanation. These are in-flow notices, with no overlay or shadow.

## Do's and Don'ts

### Do:
- **Do** keep the selected invoice, exact terms and receipt visually connected.
- **Do** retain visible state words alongside their color treatment.
- **Do** preserve phone gutters, larger final phone typography and wrapping receipt values.
- **Do** use visible keyboard focus and respect reduced motion.
- **Do** label local samples and execution environment truthfully.

### Don't:
- **Don't** convert the invoice desk into a balance-tile dashboard.
- **Don't** add floating shadows to the flat sheet system.
- **Don't** hide long receipt values behind inaccessible truncation.
- **Don't** introduce a second font or decorative imagery without a new design decision.
