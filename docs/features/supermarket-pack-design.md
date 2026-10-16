# Supermarket Pack Design — STEP 0

**Document type:** design-before-code (required by the brief before any implementation)  
**Status:** Draft — pending implementation  
**Brief source:** `docs/features/supermarket-features-brief.md`

---

## Implementation order per brief

A → B → C → D → E → F → G (with three pre-brief fixes folded in first)

---

## Pre-brief fixes (already done in prior commits)

| Fix | Commit | Status |
|---|---|---|
| Table header alignment (numeric prop removed from TH) | `1f69308` + `c82e803` | ✅ done |
| Purchase expiry as calendar date picker | `a21beae` | ✅ done |
| Void reason on cancelled purchase details | `1762118` | ✅ done |

---

## A. Excel / CSV import-export infrastructure + Products

### Files touched

**New:**
- `src/main/services/importExport.ts` — shared import/export orchestration service
- `src/main/services/importExport.test.ts`
- `src/domain/importNormalize.ts` — pure row validators/normalizers (trim, digit conversion, piaster parsing)
- `src/domain/importNormalize.test.ts`
- `src/renderer/pages/products/ImportExportDialog.tsx`
- `src/renderer/pages/products/importExportPage.tsx` (central hub, added to nav)
- `src/shared/importExport.ts` — IPC types for import/export channels
- `migrations/0009_supermarket_a_import_export.sql` — adds `data.import` and `data.export` permission codes to settings (no table change needed; permissions live in code)

**Modified:**
- `src/shared/ipc.ts` — add `importExport:*` channels
- `src/main/ipc/operations.ts` — register new channels
- `src/renderer/i18n/ar.json` — new Arabic strings
- `src/renderer/app/navigation.ts` — add Import/Export page
- `src/renderer/pages/products/ProductsPage.tsx` — add Import/Export toolbar buttons

### Schema impact

**No new tables.** Products, barcodes, product_units, categories, stock_movements all exist.  
The `products` table needs one additive nullable column for scale PLU (step D); we defer that to migration 0010.

### New permission codes

| Code | Roles | Rationale |
|---|---|---|
| `data.import` | owner, manager | Bulk data write; high risk |
| `data.export` | owner, manager | Data visibility |

Both recorded in DECISIONS.md as Decision #15.

### XLSX library decision

**exceljs** (MIT, actively maintained, no security advisories as of 2026-10). Constraints:
- Pinned to exact version in package.json
- No network at runtime (bundled)
- Reads cell values only (no formula evaluation)
- File size limit: 20 MB; row limit: 20,000
- Barcode/SKU/phone columns: read as text; detect scientific notation; flag rows

### Import wizard flow (all entities)

1. File picker (XLSX or CSV) → parse headers
2. Auto-map columns (Arabic + English header names)
3. Preview with per-row validation (Arabic error per row)
4. Mode: create-only / update-existing / both; skip or fail on duplicates
5. Dry-run (validate all rows first); then one atomic transaction
6. Result report: created / updated / skipped / failed + downloadable error file

### Products-specific design

- **Match key for updates:** barcode first, then SKU. Never name-only.
- **Opening stock:** only when `on_hand_qty == 0` AND no prior movements. Uses `applyMovement` through StockEngine with reason `"opening_balance"`. Re-import same sheet warns and skips if stock > 0.
- **Prices:** integer piasters; reject negatives; warn when price < cost.
- **Barcodes:** multiple per row separated by `;`. All normalized, leading zeros kept.
- **Categories:** auto-create missing categories with a confirmation count in the result.
- **Bulk price update:** dedicated `"تحديث الأسعار"` mode — match by barcode/SKU, before/after preview, audit of changed fields.
- **Template file:** downloadable XLSX with headers, sample row, notes sheet in Arabic.
- **Export:** all products + current stock + barcodes (same columns as template).

### Risks

- Excel destroys leading-zero barcodes → detect and flag (Arabic error message)
- Large files (3,000 rows) must be atomic; test on weak PC
- `exceljs` bundle size: verify it doesn't bloat renderer (runs in main process only)

---

## B. Barcode foundation

### Files touched

**New:**
- `src/main/services/barcodeIndex.ts` — in-memory barcode→product/unit index, refreshed on catalog changes
- `src/domain/barcodeValidation.ts` — pure EAN-13/EAN-8/UPC-A check-digit validation + normalization
- `src/domain/barcodeValidation.test.ts`

**Modified:**
- `src/main/ipc/operations.ts` — barcode lookup uses the index
- `src/shared/ipc.ts` — `catalog:lookupBarcode` channel
- `src/renderer/pages/products/ProductDialog.tsx` — barcode field scanner-friendly (Enter → add)
- `src/renderer/i18n/ar.json` — barcode error messages

### Schema impact

None. `barcodes` table already exists with unique normalized barcode index.

### Barcode normalization

```ts
// In src/domain/barcodeValidation.ts (pure)
normalize(raw: string): string  // trim, Western digits, no spaces
validateCheckDigit(code: string): 'valid' | 'invalid_check' | 'not_standard_length'
```

### Barcode index

Built in main process, kept in memory as `Map<string, { productId, productUnitId | null }>`. Refreshed on every catalog mutating IPC call. Lookup is O(1); no IPC round-trip per scan.

### Unknown barcode in POS

Non-blocking toast: "الباركود غير موجود. إضافة منتج جديد؟" — owner/manager only. Cashier sees inline error. Opens `ProductDialog` with barcode prefilled.

### Risks

- Prefix collision between scale (step D) and internal barcodes (step F): validate in Settings

---

## C. Fast scanning in POS

### Files touched

**New:**
- `src/renderer/lib/scanDetector.ts` — pure scan detector (character timing + length + terminator)
- `src/renderer/lib/scanDetector.test.ts`

**Modified:**
- `src/renderer/pages/pos/PosPage.tsx` — wire up scan detector
- `src/renderer/i18n/ar.json` — scan-related messages
- `src/renderer/pages/settings/FeaturesSection.tsx` — scanner threshold settings UI

### Scan detector design

```ts
// Pure function, injectable timing
type ScanEvent = { chars: string[]; timings: number[] }
isScan(event: ScanEvent, config: ScanConfig): boolean
// config: minLength, maxInterCharMs, terminators
```

- Default: chars arrive < 50 ms apart, min length 4, terminated by Enter/Tab
- Uses `event.code` for digit detection (Arabic keyboard layout safe)
- Does not leak into focused text inputs (check `event.target`)

### Multiplier mode

`5*` prefix before scan → adds 5 of the scanned item.

### Audio feedback

WebAudio API (no external file): short sine-wave beep on success, different tone on error. Fully offline. Mute setting in preferences.

### Scan while modal open

If payment dialog is open: ignore scan + subtle Arabic notice.

### Performance target

Scan → cart update < 100 ms. No IPC round-trip: barcode index is renderer-side copy or instant main-process lookup via the index built in step B.

---

## D. Scale barcodes

### Files touched

**New:**
- `src/domain/scaleBarcode.ts` — pure configurable decoder
- `src/domain/scaleBarcode.test.ts` — hand-checked vectors from brief
- `migrations/0010_supermarket_d_scale_plu.sql` — adds `products.scale_plu TEXT NULL UNIQUE`

**Modified:**
- `src/main/ipc/operations.ts` — scale barcode pre-decode before normal lookup
- `src/renderer/pages/settings/FeaturesSection.tsx` — scale config UI (owner only)
- `src/renderer/i18n/ar.json`
- `src/shared/rows.ts` — add `scalePlu` to ProductRow

### Migration 0010 (additive)

```sql
ALTER TABLE products ADD COLUMN scale_plu TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_scale_plu
  ON products(scale_plu) WHERE scale_plu IS NOT NULL;
```

No trigger changes. `db:verify` updated to know about the new column (no new verification code needed).

### Decoder design (pure)

```ts
// In src/domain/scaleBarcode.ts
type ScaleConfig = {
  enabled: boolean
  prefixes: string[]          // default ['20']
  pluLength: number           // default 5
  valueLength: number         // default 5
  valueType: 'weight_grams' | 'price_piasters'
  validateCheckDigit: boolean // EAN-13
}

type DecodeResult =
  | { ok: true; plu: string; value: number; valueType: ScaleConfig['valueType'] }
  | { ok: false; error: 'prefix_not_matched' | 'unknown_plu' | 'invalid_check_digit' | 'zero_value' | ... }

decode(barcode: string, config: ScaleConfig): DecodeResult
```

### Hand-checked test vectors (from brief)

```
Config: prefix '20', PLU 5 digits, value 5 digits, weight-embedded, validate EAN-13
'2000123003504': PLU=00123, value=00350 (350g), check=4 ✓
  With price 12000 piasters/kg: subtotal = mulDivRoundHalfUp(12000, 350, 1000) = 4200 piasters

Config: price-embedded
'2000123042008': PLU=00123, value=04200 (42.00 EGP = 4200 piasters), check=8 ✓
  With price 12000/kg: qty = mulDivRoundHalfUp(4200, 1000, 12000) = 350g
```

Both vectors are covered by tests with the exact numbers above.

### New permission codes

None. Scale config falls under existing owner-only settings access.

### DECISIONS.md entry

Decision #16: `products.scale_plu` additive nullable column.

---

## E. Wallet payments in POS

### Files touched

**Modified:**
- `src/renderer/pages/pos/PaymentDialog.tsx` — add wallet provider + reference field
- `src/renderer/pages/pos/payment.ts` — extend tender types
- `src/renderer/pages/pos/PosPage.tsx` — pass wallet details to IPC
- `src/shared/ipc.ts` — add `walletProvider` and `walletReference` to `SaleTenderInput`
- `src/main/services/sales.ts` — persist wallet details (existing `reference_text` column)
- `src/renderer/pages/settings/FeaturesSection.tsx` — payment methods + wallet providers list
- `src/renderer/i18n/ar.json`

### Schema impact

`money_ledger.reference_text` column **already exists** (TEXT NULL). Wallet provider and transaction reference both fit there as `"${provider}:${reference}"` — no migration needed.

### Design

- Three tender types already supported by the IPC: `cash`, `card`, `wallet`
- Non-cash tender: optional provider (Vodafone Cash, InstaPay, Orange, Etisalat, WE, Other) + optional reference number
- "تأكدت من وصول المبلغ" confirm step for non-cash (setting, default on)
- Change only from cash tenders (existing domain rule unchanged)
- Shift expected cash = cash only (existing rule unchanged)
- Reports: add wallet breakdown column

### New permission codes

None.

---

## F. Barcode label printing

### Files touched

**New:**
- `src/main/printing/labelTemplate.ts` — SVG/HTML label renderer
- `src/main/printing/barcodeEncoder.ts` — pure EAN-13 and Code 128 SVG encoder
- `src/main/printing/barcodeEncoder.test.ts`
- `src/renderer/pages/labels/LabelsPage.tsx`
- `src/renderer/pages/labels/LabelPrintDialog.tsx`
- `migrations/0011_supermarket_f_internal_barcode_seq.sql` — device_sequences row for internal barcode sequence

**Modified:**
- `src/shared/ipc.ts` — `printing:printLabels` channel
- `src/main/ipc/operations.ts`
- `src/renderer/app/navigation.ts` — add Labels page
- `src/renderer/i18n/ar.json`

### Internal barcode generation

EAN-13 with prefix `29` (configurable, must not overlap scale prefix `20` — validate in Settings).  
Sequence from `device_sequences` (new row: `sequence_name = 'internal_barcode'`).  
Saved to `barcodes` table as a normal barcode (audited).

### Migration 0011 (additive)

Inserts the initial `internal_barcode` sequence row if not already present. No table changes.

### Label printing

- HTML/SVG rendered in a hidden BrowserWindow; print via Windows driver silently (existing printing architecture)
- Barcode drawn locally: EAN-13 (valid 13-digit codes) or Code 128 (otherwise)
- Label sizes: 50×30mm (default), 40×25mm, 58mm roll, A4 3×8 grid
- Fields: name, price, barcode, optional SKU/expiry date

### DECISIONS.md entry

Decision #17: Internal barcode prefix `29`, sequence `internal_barcode` in `device_sequences`, SVG rendering via Windows driver (no raw TSPL/ZPL in v1).

---

## G. Remaining Excel flows

**Done per step A infrastructure** — same wizard, same IPC patterns, one commit per entity:

| Entity | IPC channel prefix | Notes |
|---|---|---|
| Customers | `importExport:customers:*` | No opening-balance (BLOCKED — see open decisions) |
| Suppliers | `importExport:suppliers:*` | Same as customers |
| Purchase line fill | `importExport:purchaseLines:*` | Fills dialog, user saves manually |
| Stock count sheet | `importExport:stockCount:*` | Blind export; import → DRAFT only |
| Export: sales/purchases/returns/expenses/shifts/statements | `importExport:export:*` | XLSX + CSV |

### Open decisions (deferred to human)

**Customer/supplier opening balances:** The frozen schema derives balances from documents only. An "opening balance" cannot be stored as a piaster number without adding a new document type (e.g. `opening_balance_document`). This would require a migration and is NOT implemented in G. Options for the human to choose from:
1. Add a dedicated `opening_balance` document type (new migration) — safest, auditable
2. Record it as a `customer_receipt` with reference text "رصيد افتتاحي" — fits existing schema, no migration
3. Defer opening balances entirely from G

The human must decide before implementation of G.

---

## Risks across all features

1. **Bundle size:** exceljs is large (~1 MB min+gz). Must verify the renderer never imports it (main-process only, behind IPC).
2. **Weak PC performance:** 3,000-row import in one transaction; measure time.
3. **Prefix collision:** scale prefix + internal barcode prefix must be validated together in Settings on change.
4. **Scanner timing on weak PCs:** debounce values may need tuning; expose as settings.
5. **Label printing quality:** 203 dpi minimum bar width for EAN-13; must be tested on real label printer (hardware test, not AI-verifiable).

---

## Assumptions

1. The brief says "evaluate XLSX library" — chosen: **exceljs** (MIT, actively maintained). Rationale documented above.
2. Wallet details stored in existing `reference_text` column (no migration). If the human needs separate columns, a migration can be added.
3. `products.scale_plu` is the only schema change needed for steps A-G; added in migration 0010.
4. No new `device_sequences` table changes (only row insertions in migration 0011).
5. Steps A-G are implemented in strict order with full green test+lint+build before each commit.
6. Label printing (F) uses the existing BrowserWindow+Windows driver architecture from Phase 0; no raw TSPL/ZPL.

---

## Implementation checklist (for the AI to track)

- [x] Pre-brief fixes (table, expiry picker, void reason) — already committed
- [ ] Step A: exceljs eval + import/export infrastructure + Products import/export
- [ ] Step B: Barcode foundation + index + unknown-barcode POS flow
- [ ] Step C: Scan detector + POS wiring + audio
- [ ] Step D: Scale barcode decoder + migration 0010
- [ ] Step E: Wallet payments in POS
- [ ] Step F: Label printing + internal barcode generator + migration 0011
- [ ] Step G: Remaining entity Excel flows (customers, suppliers, purchases, stock count, exports)
