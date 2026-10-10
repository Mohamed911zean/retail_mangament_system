# UI layer

How the renderer is put together, and the conventions a new screen must follow.
Read together with `docs/design_system/design_system.md` (the visual spec) and
`AGENTS.md` §4 (the architecture).

## Files

```
src/
  main.tsx                     renderer entry: mounts <App/>
  App.tsx                      providers → boot → login → shell
  renderer/
    styles/
      app.css                  stylesheet entry: Tailwind + tokens + base layer
      tokens.css               every colour, space, radius, shadow, motion token
      fonts.css                local Cairo woff2 (no remote fetch)
    i18n/
      ar.json                  ALL user-visible text
      index.ts                 `messages` + `translate('errors.code')`
    lib/
      format.ts                money / quantity / date / bytes formatting
      ipc.ts                   `unwrap(IpcResult)` → value or `ApiError`
      preferences.ts           UI-only prefs in localStorage (pure parser)
      toast.ts                 toast context + `useToast`
      cn.ts                    conditional class names
    components/
      icons.tsx                inline SVG icons (16 / 20 / 24 only)
      ui/                      the primitive kit; import from `components/ui`
    app/
      AppShell.tsx             sidebar + header + page area
      Sidebar.tsx, AppHeader.tsx
      navigation.ts            the page list (data, not markup)
      useAuth.ts, useLicense.ts
    pages/
      LoginPage.tsx            login + first-run setup
      HomePage.tsx, SettingsPage.tsx, PlaceholderPage.tsx
      settings/*.tsx           one card per concern
      pos/                     the selling screen (see below)
      DesignSystemPage.tsx     dev-only gallery (a lazy chunk in dev builds only)
```

## The selling screen (`pages/pos/`)

The one screen where the money is decided, so its shape is deliberate:

```
PosPage.tsx        the only stateful file: cart, customer, open dialog, IPC calls
  cart.ts          PURE cart model + totals — reuses src/domain, so the screen and
                   the invoice are computed by the same functions
  payment.ts       PURE tenders, change, and the "may this be saved?" rule
  search.ts        PURE product filtering + exact barcode lookup
  ProductPicker.tsx  search field + tappable grid (owns the query and its debounce)
  CartTable.tsx      the invoice lines
  TotalsFooter.tsx   subtotal → discounts → tax → rounding → total
  DiscountDialog.tsx, PaymentDialog.tsx, CustomerDialog.tsx,
  HeldSalesDialog.tsx, ShiftGate.tsx, ShiftCloseDialog.tsx
```

Rules that keep it honest:

- **Every component below `PosPage` is presentational.** They receive integers and
  formatted-ready values (`lineTotals`, `totals`) and send back integers. No
  arithmetic on money or quantity happens in a `.tsx` file.
- **A completed sale drops the cart.** The invoice is never edited after it is
  saved; a correction is a return document, made from the sales screen.
- **The totals on screen come from `src/domain`** — the same `calculateLineAmounts`
  and `calculateSaleTotals` the sale service runs. A screen with its own arithmetic
  would eventually disagree with the receipt it just printed.
- **The cart pane is first in the DOM** (the start side, i.e. the right in RTL),
  the product grid second.
- Keyboard: `F2` search, `F4` hold, `F5` held sales, `F8` invoice discount,
  `F9` customer, `Ctrl+Enter` pay, `Delete` remove the selected line, `Esc` clear
  the selection. `Delete`/`Esc` are ignored while a field has focus, so they edit
  the number and not the invoice.

## Rules

1. **No text in components.** Every string comes from `i18n/ar.json` via
   `messages`. An error code from the main process becomes Arabic through
   `translate('errors.<code>')` — the renderer never writes its own error copy.
2. **No raw values.** Colour, spacing, radius and shadow come from `tokens.css`
   through Tailwind classes (`bg-brand-700`, `p-4`, `rounded-lg`). No hex, and no
   px except the few layout widths that are already tokens.
3. **Logical properties only.** `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`,
   `text-start`. Never `left/right`, `ml/mr`, `pl/pr` — they break in RTL.
4. **Integers cross the boundary.** Money is piasters, quantity is the smallest
   unit; `lib/format` is the only module that turns them into text.
5. **Numbers are isolated.** Wrap money, quantities, invoice numbers and barcodes
   in `.numeric` (direction ltr, aligned to the end, tabular digits) or `<bdi>`,
   so a minus sign or a `%` never flips in RTL.
6. **Reuse `components/ui`.** A one-off style in a page is a bug: restyle the
   primitive or the token instead.
7. **Every flow is keyboard-operable** with a visible focus ring (§4.2).

## Adding a screen

1. Add the key and its label to `app/navigation.ts` (`NavItem`), with `built: true`.
2. Add its title/description to `PAGE_HEADINGS` in `AppShell.tsx` and a `case` in
   `renderPage()`.
3. Add the Arabic strings to `ar.json`; add any new IPC call to
   `src/shared/ipc.ts` **and** the operation table in `src/main/ipc/operations.ts`
   (`ipc/operations.test.ts` fails if a channel has no operation, or one has no
   channel).
4. Give it empty, loading and error states (§4.7) before it is called done.

## What is and is not built

Built: the shell, navigation, login/first-run setup, Home, Settings (appearance,
feature flags + presets, printing, backup/restore, licence), the POS screen, and
the dev gallery.

Not built yet (they render an explicit "coming soon" panel, never a blank screen):
inventory, purchases, sales, customers, suppliers, reports.

## Verifying the UI

- `npm test` — the pure parts (formatting, preferences, i18n lookup, IPC, and the
  POS cart/payment/search modules).
- `npm run check:contrast` — fails when a token change breaks a §3.2 contrast pair.
- `npm run lint` and `npm run build` — must be green before a commit.
- The gallery (`لوحة المكونات (تطوير)` in the sidebar in a dev build) is the place
  to eyeball every component in RTL and in Lite mode.

### Not verified in a real window (as of the POS commit)

- **Still nothing has been rendered in the Electron window.** The shell, login,
  Settings and the whole POS screen have only been type-checked, linted and
  unit-tested. No interactive flow — a real sale, a real hold/resume, a real shift
  close, a real print — has ever been executed in a GUI.
- Specifically unverified on the POS: the RTL two-pane layout at 1280×720, the
  scanner path (a keyboard wedge typing into the search field), the debounce
  timing on a weak PC, focus behaviour when the customer picker is stacked over
  the payment dialog, and every keyboard shortcut.
- The Cairo woff2 files are not downloaded yet, so the fallback font
  (`Segoe UI`, `Tahoma`) is what would render today.
