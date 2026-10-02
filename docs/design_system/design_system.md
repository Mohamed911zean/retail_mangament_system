# Design System — Small Shop POS (working brand name: "RetailOS")

> Authoritative UI spec. Read together with `AGENTS.md`. If this file conflicts with the original mockup image, **this file wins**.
> Goal: a UI that is **calm, simple, very easy on the eyes, and fast to use all day** by a shop owner or cashier on a **weak Windows 10 PC**, in **Arabic RTL**.

## 1. Principles

1. **Clarity over decoration.** Few colors, few shapes, lots of whitespace. One main action per screen.
2. **Speed for the cashier.** Keyboard + barcode scanner first, mouse/touch second. Never make the cashier hunt.
3. **Readable for everyone.** Large enough text, high contrast, never rely on color alone.
4. **Light on weak hardware.** No blur, no heavy shadows, no animated layouts. Small bundle, local fonts.
5. **Customizable.** Everything visual comes from tokens, so a client's brand color/logo/name can be changed without touching components.
6. **Consistent.** Build once in `components/ui`, reuse everywhere. No one-off styling in pages.

## 2. Deviations from the original mockup (and why)

| Mockup | Problem | Decision |
|---|---|---|
| Primary hex written `#07546` (5 digits, invalid) | Not a valid color | Use **`#02534B`** (measured from the image). |
| White text on Success `#10B981` (2.54:1), Warning `#F59E0B` (2.15:1), POS "complete sale" button `#03A878` (3.05:1) | Fails contrast (min 4.5:1 for text) | Darker solids / dark text on amber (see §4.1). **"Complete sale" uses the primary button.** |
| Success and Warning as normal *buttons* | Green success button looks like the brand button; confusing | **Remove** Success/Warning button variants. Success/Warning appear only as badges, alerts, icons. |
| Placeholder/hint text in Gray `#94A3B8` (2.56:1) | Hard to read | Muted text = **gray-500 `#64748B`** (4.76:1 on white). `#94A3B8` is for borders/disabled only. |
| Two fonts: Cairo + Inter | Extra files, mismatched look | **Cairo only** (it includes Latin). Fewer files, better on weak PCs. |
| Hero illustration, large decorative areas | Not needed inside the app | Hero art only on first-run/licence screens, as a small inline SVG (< 20 KB). Not in daily screens. |
| Small button size looks ~28 px | Too small for POS | Min control height 40 px; POS actions 48–56 px (§4.5). |
| No states, spacing scale, focus, dialogs, toasts, badges, empty/loading/error | Incomplete | Defined below. |

## 3. Foundations

### 3.1 Implementation
- Tokens are **CSS variables** in `src/renderer/styles/tokens.css`; Tailwind's theme reads them (`colors: { brand: { 600: 'var(--brand-600)', ... } }`). **No hardcoded hex/px in components.**
- Use **logical** properties/utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `border-s`). Never `left/right/ml/mr` — they break RTL.
- `<html lang="ar" dir="rtl">`.

### 3.2 Color tokens

**Brand (forest green)** — `brand-700` is the main brand/primary color.

| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#E9FCF3` | "Mint Fog": soft backgrounds, hover rows, selected row |
| `--brand-100` | `#CDF5E1` | secondary button bg, chips |
| `--brand-200` | `#9BE6C6` | decorative |
| `--brand-300` | `#5FD0A6` | decorative |
| `--brand-400` | `#2DB587` | decorative |
| `--brand-500` | `#0E9670` | icons on light bg (large only; 3.7:1 with white — not for text) |
| `--brand-600` | `#077A5E` | focus ring, links (white on it = 5.3:1) |
| `--brand-700` | `#02534B` | **Primary** (white on it = 9.0:1) |
| `--brand-800` | `#013F3A` | primary hover |
| `--brand-900` | `#012E2B` | primary pressed, sidebar header |

(Intermediate shades are interpolated; tune visually but keep the contrast numbers above.)

**Neutrals (slate)** — renumbered vs the mockup so the number matches the use.

| Token | Hex | Use |
|---|---|---|
| `--gray-0` | `#FFFFFF` | cards, inputs |
| `--bg-app` | `#F8FDFA` | app background (very light mint tint) |
| `--gray-100` | `#F1F5F9` | table header, disabled bg |
| `--gray-200` | `#E2E8F0` | dividers, card borders |
| `--gray-300` | `#CBD5E1` | subtle borders |
| `--gray-400` | `#94A3B8` | control borders, disabled text, icons (not for text) |
| `--gray-500` | `#64748B` | **muted text**, placeholders (4.76:1 on white; on `gray-100` use gray-600) |
| `--gray-600` | `#475569` | secondary text (7.6:1) |
| `--gray-800` | `#1E293B` | strong text |
| `--gray-900` | `#0F172A` | main text (17.9:1) |

**Semantic** — each has a *solid* (fill with white text), and a *soft* pair (bg + text) for badges/alerts.

| Role | Solid | White-on-solid | Soft bg | Soft text |
|---|---|---|---|---|
| Success | `#047857` | 5.5:1 | `#D1FAE5` | `#065F46` (6.8:1) |
| Warning | `#F59E0B` (**use dark text `#0F172A`**, 8.3:1) | — | `#FEF3C7` | `#92400E` (6.4:1) |
| Error | `#DC2626` | 4.8:1 | `#FEE2E2` | `#B91C1C` (5.3:1) |
| Info | `#2563EB` | 5.2:1 | `#DBEAFE` | `#1D4ED8` (5.5:1) |

Rules:
- Text on backgrounds ≥ **4.5:1**; large text (≥ 18px or 14px bold) and UI icons ≥ 3:1.
- Control borders use `gray-400` (2.56:1 — slightly under the 3:1 guideline; compensated by white fill + strong focus ring). Use `gray-500` for borders if a screen needs more definition.
- **Color is never the only signal**: always pair with an icon or text (e.g. error = red border + icon + message).
- Brand and success are both green: keep them apart by **usage** — brand = actions/navigation; success = status only.
- Semantic colors and neutrals are **not** overridable per client. Only `--brand-*` is (see §9).

### 3.3 Typography (Cairo only)

- Bundle **local woff2** files: weights **400, 600, 700**, subset to Arabic + Latin + digits. Do not load variable/full font files if they are heavy. No remote fonts. Fallback: `"Segoe UI", Tahoma, sans-serif`.
- Digits: **Western digits (0–9) by default** (what shop owners expect on prices). A setting may switch display to Arabic-Indic digits via our own formatter only (do not rely on `Intl` `ar-EG` defaults).
- Normalize input: convert Arabic-Indic digits (٠-٩) typed by users to 0-9 in all numeric/barcode/phone fields.
- Numbers in tables/prices: tabular alignment (`font-variant-numeric: tabular-nums` if Cairo supports it; verify in the gallery and fall back to fixed-width digit rendering if not).

| Style | Size / weight | Line height | Use |
|---|---|---|---|
| Display (POS total) | 32 / 700 | 1.2 | grand total, change due |
| H1 | 28 / 600 | 1.3 | page title |
| H2 | 22 / 600 | 1.3 | section title |
| H3 | 18 / 600 | 1.4 | card title |
| Body | 16 / 400 | 1.6 | default |
| Table / dense | 14 / 400 | 1.5 | tables, forms in dense screens |
| Small | 14 / 400 | 1.5 | helper text |
| Caption | 12 / 400 | 1.4 | minimum size; timestamps, badges only |

Arabic needs generous line height; never go below 12px; never justify text.

### 3.4 Spacing, radius, elevation, motion

- **Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48. Page padding 24. Card padding 16–20. Gap between form fields 16.
- **Radius:** `sm 6` (badges), `md 10` (inputs, buttons), `lg 14` (cards), `xl 20` (dialogs). Consistent, soft.
- **Elevation:** prefer **1px borders** (`gray-200`). At most two shadows: `shadow-sm` (cards, optional) and `shadow-md` (dialogs, menus). No blur/backdrop-filter, no colored glows.
- **Motion:** only `opacity`, `transform`, `background-color`, `border-color`; **120–160 ms ease-out**. No layout animations, no page transitions. Respect `prefers-reduced-motion`. A **"Lite mode"** setting turns off all transitions and shadows (for very weak PCs).
- **Z-index scale:** base 0, sticky 10, dropdown 20, dialog 30, toast 40.

### 3.5 Layout
- Design for **1366×768** (very common on cheap laptops); must be fully usable at **1280×720**; scales up to 1920×1080. Desktop only (no mobile breakpoints in v1).
- Shell: **sidebar at the right** (RTL start), width 240 (collapsible to 72, icons only), content area with page header (title + primary action at the end side).
- Content max width not enforced in tables/POS; forms max 720.

### 3.6 Icons
- **Lucide** outline icons, stroke 1.75, sizes 16 / 20 (default) / 24. Bundle only the icons used (tree-shaking), inline SVG, no icon fonts.
- Icons with direction (arrows, chevrons, "back/next") must flip in RTL (`[dir=rtl] .icon-directional { transform: scaleX(-1) }`).
- An icon-only button must have an `aria-label` (Arabic) and a tooltip.

## 4. Components

Build these as primitives in `src/renderer/components/ui/` (headless accessible helpers such as Radix/React Aria are allowed for Dialog, Select, Popover, Tooltip; **no MUI/Ant/Bootstrap-size kits**). Every component has these states designed: default, hover, focus-visible, active, disabled, loading (where relevant), error (inputs).

### 4.1 Button
Variants: **primary** (brand-700 bg, white text), **secondary** (brand-100 bg, brand-700 text), **outline** (white bg, gray-400 border, gray-900 text), **ghost** (no bg, for toolbars/rows), **danger** (error solid, white text). *No success/warning buttons.*

| Size | Height | Font | Use |
|---|---|---|---|
| `sm` | 32 | 14 | inside tables, mouse only |
| `md` | 40 | 16 | default |
| `lg` | 48 | 16–18 | dialogs, forms' main action |
| `pos` | 56 | 18 / 600 | POS actions (pay, hold, discount) |

Rules: **one primary button per view**; destructive actions are `danger` + confirmation dialog; label = verb + object in Arabic ("حفظ المنتج"، "إتمام البيع"), never "OK/نعم". Loading = spinner replaces icon, width stays fixed, click disabled. Hover = darker (`brand-800`), pressed = `brand-900`, disabled = `gray-100` bg + `gray-400` text.

### 4.2 Form controls
- **Label above** the field (14/600, gray-800), helper text below (14, gray-500). Height 40 (`md`), 48 for POS-critical inputs. Radius 10, border `gray-400`, bg white.
- **Focus-visible:** 2px ring `brand-600` + 2px offset on **every** focusable element (keyboard users and cashiers rely on it). Never remove outlines.
- **Error:** border `error`, icon, and a message **below** the field in Arabic that says what to do ("اكتب اسم المنتج", not "خطأ"). Required fields marked with `*` and also announced in text. Validate on blur/submit, not on every keystroke.
- **Text input:** inline icon at the start side for search. Clear button when it has text.
- **Search / barcode input:** large (48), always auto-focused on the POS screen, accepts scanner input (keyboard wedge + Enter), never loses focus after adding an item.
- **MoneyInput:** accepts decimals (max 2 places), shows `ج.م` suffix, `dir="ltr"` text aligned to end, **converts to integer piasters** on commit (see AGENTS.md money rule). **QuantityInput/Stepper:** −/+ buttons plus typing; select-all on focus; supports fractional units (kg/g) per product unit settings.
- **Select / Combobox:** use a **searchable combobox** for products, customers, suppliers (type to filter, ↑↓ + Enter). Plain select only for short fixed lists (<8 options).
- **Date:** Gregorian `yyyy/MM/dd`, 12-hour time with ص/م by default (setting). Quick presets in reports (اليوم، أمس، هذا الأسبوع، هذا الشهر).
- **Toggle:** label at the start side, state shown by position + text ("مفعّل/متوقف"), not color only.

### 4.3 Table
- Header `gray-100` bg, 14/600; rows 44px (comfortable) or 36px (compact — user setting); 1px `gray-200` dividers; row hover/selected = `brand-50`. **Sticky header.**
- First column is the main identifier (product name). Row actions: ghost icon button / "⋮" menu at the **end** side.
- **Numeric columns** (price, qty, total): `dir="ltr"`, `text-align: end`, tabular digits; currency formatted by the single `formatMoney(piasters)` helper (e.g. `120.00 ج.م`). Wrap numbers/currency in `<bdi>` or `unicode-bidi: isolate` so signs, `%` and parentheses don't flip.
- Totals row: bold, `brand-50` bg. Sorting indicator on sortable headers. Empty state when no rows. **Virtualize** lists over ~200 rows; paginate reports (50/page).

### 4.4 Cards, tiles, badges
- **Card:** white bg, 1px `gray-200` border, radius 14, padding 16–20, optional `shadow-sm`.
- **Stat card:** label (14, gray-600), value (28/700), delta chip (soft success/error) with arrow icon + text.
- **Quick tile** (dashboard): icon (24) + label, min height 88, whole tile is a button.
- **Badge/chip:** soft bg + dark text + optional icon; radius 6; 12–14px. Standard statuses: مدفوع (success), آجل (warning), جزئي (info), مرتجع (info), ملغي (gray), مخزون منخفض (warning), نفد (error), قارب على الانتهاء (warning), منتهي الصلاحية (error).

### 4.5 POS screen (most important screen)
- Layout at 1366×768, **no page scroll**: **invoice/cart table at the start side (right)**, **search + quick products grid at the end side (left)**, **fixed totals footer** with subtotal, discount, **grand total (Display 32/700)** and the **primary "إتمام البيع" pos button**. Secondary actions (hold, discount, customer, cancel) as `pos` outline buttons.
- Search field always focused; scanner adds the item and returns focus; duplicate scan increments quantity; selected cart row is highlighted; quantity editable inline.
- **Payment dialog:** big amount due, quick cash buttons by Egyptian notes (**5, 10, 20, 50, 100, 200**, "المبلغ بالضبط"), tendered input, **change due** shown large, payment method tabs (نقدي / آجل / مختلط), Enter confirms, Esc goes back. After success: print receipt automatically (setting) and return to an empty cart.
- **Keyboard shortcuts (proposed, configurable, shown as hints on buttons):** `F2` focus search · `F4` hold sale · `F5` resume held · `F8` discount · `F9` customer · `Ctrl+Enter` pay · `Del` remove selected line · `+ / −` quantity · `Esc` close dialog/cancel.
- Destructive POS actions (clear cart, void invoice) need a confirmation dialog.

### 4.6 Sidebar / navigation
- Items (permission-driven; hide what the role can't use): الرئيسية، نقطة البيع، المخزون، المشتريات، المبيعات، العملاء، الموردون، التقارير، الإعدادات.
- Item height 44, icon 20 + label; **active** = `brand-50` bg + `brand-700` text + 3px `brand-700` bar at the start edge (cheap to render; no gradients). Header shows logo + app name from config.
- Keyboard accessible; the current page has `aria-current="page"`.

### 4.7 Feedback components
- **Dialog:** radius 20, max width 480 (confirm) / 720 (forms), focus trapped, Esc closes (except mid-payment), primary button at the end side, the cancel button never red. Destructive confirms name the object ("إلغاء الفاتورة رقم 1042؟") and use a specific verb.
- **Toast:** bottom-start corner, 4 s, success/info only, dismissible. **Errors and anything involving money are not toasts** — use an inline alert or dialog that stays until acknowledged.
- **Inline alert:** soft semantic bg + icon + text (+ action).
- **Empty state:** small icon + one sentence + one action ("لا توجد منتجات بعد — أضف أول منتج").
- **Loading:** skeleton rows for tables, small spinner for buttons; if an operation is < 300 ms show nothing.
- **Error screen:** plain Arabic explanation + "إعادة المحاولة" + where the log is. Never show raw stack traces to the user.

## 5. Writing (Arabic UI copy)
- Friendly, short, direct, in simple Arabic (Egyptian-friendly but not slang): "تم حفظ الفاتورة".
- Error = what happened + what to do. Buttons = verb + object. Same word for the same concept everywhere (e.g. always "المنتج", "الصنف" — pick one and keep it; keep a glossary in `src/renderer/i18n/glossary.md`).
- All strings in `i18n/ar.json`; no text inside components.

## 6. RTL & formatting rules
1. Logical CSS properties only. Test every screen in RTL.
2. Isolate numbers, currency, phone numbers, barcodes, invoice numbers with `dir="ltr"` / `<bdi>`.
3. Flip directional icons; do **not** flip logos, checkmarks, or media controls.
4. Money display: `formatMoney(piasters)` → `120.00 ج.م`. Quantity: `formatQty(value, unit)`. Dates: `formatDate`. Only these helpers format values.
5. Printing templates are RTL and use the same tokens (monochrome-safe: receipts must read well in pure black on white).

## 7. Accessibility
- Full keyboard operation for every flow, logical tab order, visible focus.
- Contrast numbers in §3.2 are requirements; run the contrast check script on any token change.
- Do not rely on color alone; hit targets ≥ 40 px (POS ≥ 48); text ≥ 14 px except captions.
- Dialogs trap focus and restore it on close; icon buttons have Arabic `aria-label`s.

## 8. Performance (weak PCs)
- No `backdrop-filter`, blur, large shadows, gradients, or animated SVG. Transitions only on cheap properties.
- Product thumbnails stored locally as **WebP ≤ 96×96**, lazy-loaded; fallback is a neutral icon tile.
- Virtualize big lists, debounce search (≈ 120 ms), avoid re-rendering the whole cart on each keystroke (memoize rows).
- Fonts: subset local woff2; icons: inline SVG only used ones. Keep the renderer bundle small and record its size in `docs/`.
- Provide the **Lite mode** setting (§3.4).

## 9. Theming per client
- A client overlay (`/clients/<name>/`) may override: `--brand-50…900` scale, logo, app name, receipt header/footer, and optionally the Arabic font weight. It may **not** override semantic colors, neutrals, spacing, or component behavior.
- When overriding the brand scale, the rule is: white text on `brand-700`/`brand-600` must keep **≥ 4.5:1** (verify with the contrast script) and `brand-700` text on `brand-50` ≥ 4.5:1.
- App name and logo come from config (`brand.name`, `brand.logo`); "RetailOS" is only the default. Verify the name is not already in use before committing to it publicly.

## 10. Deliverables & definition of done
- `src/renderer/styles/tokens.css` + Tailwind theme mapped to the tokens.
- `src/renderer/components/ui/*` primitives listed above, each with all states.
- A **dev-only gallery page** (`/dev/design-system`, excluded from production builds) showing every component and state in RTL, in Normal and Lite modes. Use it for manual visual checks.
- `scripts/check-contrast.ts` that fails on any token pair below the §3.2 ratios.
- A UI change is "done" when: it uses only tokens/components, works in RTL at 1366×768, is fully keyboard-operable, has empty/loading/error states, all text is in `ar.json`, and the gallery is updated.

## 11. Order of work
1. Phase 0 must be finished first (see `AGENTS.md`). **Do not build real screens before that.**
2. Then: tokens + fonts + the app shell (sidebar, header) + gallery page.
3. Then primitives (Button, Input, MoneyInput, QuantityInput, Select/Combobox, Toggle, Badge, Card, Table, Dialog, Toast, EmptyState).
4. Only then the real screens, starting with the POS screen (§4.5).