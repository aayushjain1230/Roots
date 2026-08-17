# ROOTS Design System

Version: Phase 5B  
Scope: visual presentation, interaction feedback, accessibility, and reusable UI primitives.

Phase 5C workflow hierarchy and usability rules build on this system and are documented separately
in `UX_AUDIT.md`.

The design system is an enhancement layer. It does not classify food, modify evidence, call
providers, or alter stored user data. Existing feature controllers remain responsible for behavior.

## Foundations

### Colors

Use semantic roles instead of component-specific colors:

| Role | Token |
| --- | --- |
| App background | `--color-bg` |
| Standard surface | `--color-surface` |
| Raised surface | `--color-surface-raised` |
| Text | `--color-text` |
| Secondary text | `--color-text-secondary` |
| Brand action | `--color-primary` |
| Supporting accent | `--color-accent` |
| Safe/success | `--color-success` |
| Caution/warning | `--color-warning` |
| Avoid/error | `--color-danger` |
| Informational | `--color-info` |

Light and dark values continue to come from the existing theme tokens in `styles.css`. Status
meaning must always include readable text or an icon label and must never rely on color alone.

### Typography

- Hero: `--text-hero`, Sora 600.
- Page title: `--text-page-title`, Sora 600.
- Section title: `--text-section-title`.
- Card title: `--text-card-title`.
- Body: `--text-body`, Plus Jakarta Sans 400.
- Caption: `--text-caption`.
- Metadata and badges: `--text-metadata` / `--text-badge`, weight 500–600.
- Technical rule traces: `--font-mono`.

Text must remain usable at browser and operating-system text scaling. Avoid fixed-height text
containers and do not reduce input text below 16px on mobile.

### Spacing

The spacing scale is `--space-1` through `--space-9`: 4, 8, 12, 16, 20, 24, 32, 40, and 48px.
Use adjacent steps to establish hierarchy; do not introduce one-off margins.

### Shape and elevation

- `--radius-xs`: dense controls.
- `--radius-small`: buttons and inputs.
- `--radius-medium`: cards.
- `--radius-large`: prominent cards and sheets.
- `--radius-xl`: special full-width surfaces.
- `--radius-pill`: badges and chips only.

Use `--shadow-small`, `--shadow-medium`, `--shadow-large`, `--shadow-floating`, or
`--shadow-modal`. Dark mode receives purpose-built shadow values.

## Motion system

| Interaction | Duration |
| --- | --- |
| Tap feedback | 110ms |
| Success pop / fast feedback | 180ms |
| Card expansion | 220ms |
| Bottom sheet / modal | 280ms |
| Page transition | 300ms |
| Slow decorative transition | 360ms maximum |
| Camera flash | 100ms |

Use `--ease-standard` for ordinary transitions, `--ease-emphasized` for entrances, and
`--ease-spring` only for small success feedback. Never animate continuously unless it represents
active loading. Reduced-motion mode removes transforms, shimmer, and decorative animation while
preserving status changes.

The approved phone scanning sequence remains unchanged. Phase 5B only aligns its transitions,
flash, checkmark, and package shadow with these tokens.

## Components

### Buttons

Use `.primary-btn`/`.btn-primary` for the single main action, `.secondary-btn`/`.btn-secondary`
for supporting actions, `.text-btn`/`.btn-ghost` for tertiary actions, `.btn-danger` for destructive
actions, `.btn-success` for completed actions, and `.btn-outline` for neutral outlined actions.
Use `.btn-full`, `.icon-btn`, or `.floating-btn` only as modifiers.

Call `ROOTS_UI.setLoading(button, true, "Working")` during an asynchronous action and restore it
with `ROOTS_UI.setLoading(button, false, "Action label")`. Loading actions expose `aria-busy`.

### Cards

Product, restaurant, meal, history, favorite, travel, dining, and recommendation cards share the
same surface, border, radius, elevation, and interaction timing. Feature-specific classes control
only their internal layout and evidence/status presentation.

### Forms

Inputs, search fields, selects, and text areas use a 48px minimum height, semantic focus ring,
consistent padding, and theme tokens. Native checkboxes and radios retain platform semantics with
the ROOTS accent color. Visible labels are required unless a precise accessible label exists.

### Bottom sheets and dialogs

Existing modal controllers retain focus trapping, Escape handling, focus restoration, and
`aria-modal`. `.modal-content` and `.report-modal-card` share one visual sheet contract. Mobile
dialogs enter from the bottom; wider layouts are centered. Do not create a new modal style.

### Toasts

Use `ROOTS_UI.toast(message, { kind, duration, actionLabel, onAction })`. Kinds are `success`,
`error`, `warning`, and `info`. Messages are inserted with `textContent`, announced through a live
region, bounded in duration, and may contain one action.

### Loading and empty states

Use `.skeleton` only when the final geometry is known. Always pair loading visuals with meaningful
status text and cancellation where the underlying operation supports it. Use existing
`.empty-state`, `.restaurant-state`, and `.empty-feature` structures with a plain explanation and a
recovery action. Never expose stack traces.

### Icons

Use the existing outline SVG language: 24px view box, no fill, rounded line caps and joins, and
approximately 1.8–2px stroke. Icon-only buttons require an `aria-label`. Do not introduce emoji as
the only meaning-bearing icon.

### Haptics

`ROOTS_UI.haptic()` uses the installed Capacitor Haptics plugin when available and a short vibration
fallback otherwise. Run the normal Capacitor sync after dependency installation so generated native
projects receive the plugin.
Automatic feedback is limited to primary actions, favorites, saves, copies, completion, warnings,
and destructive actions. Haptics are optional enhancement and can never block an operation.

## Accessibility contract

- Interactive targets are at least 48px on touch devices.
- Keyboard focus is always visible; pointer interaction suppresses only redundant focus styling.
- Dialog focus stays trapped and returns to the invoking control.
- Statuses include text and are not encoded by color alone.
- `prefers-reduced-motion` and `prefers-contrast` are honored.
- Images use meaningful alternative text or empty alternative text when decorative.
- Layouts must work at 320, 375, 390, 414, and 430px, tablet widths, and short landscape screens.
- Components must tolerate large text without clipping or fixed-height containers.

## Usage rules

1. Reuse semantic tokens and existing component classes.
2. Keep one visually dominant action per screen or sheet.
3. Keep deterministic evidence wording and verdict hierarchy intact.
4. Do not place secrets, personal information, or untrusted HTML in UI utilities.
5. Add visual-regression and accessibility assertions when introducing a new component.
