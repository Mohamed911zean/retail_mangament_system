# Supermarket Pack — Feature Brief (for the implementing AI)

Target customer: small supermarket / grocery / frozen-food shop in Egypt, one cashier PC, offline, barcode scanner, thermal receipt printer, cash drawer, optional label-printing scale.
Audience of this file: the AI working inside the repo. Reply to the human in short Egyptian Arabic; code, docs, tests, commits in English.

## How to work (read first)

1. Read AGENTS.md, docs/DECISIONS.md, docs/schema-v1.md (frozen), docs/services.md, docs/ipc.md, docs/ui.md, docs/design_system/design_system.md, docs/manual-test-checklist.md. Verify: git status clean, npm test + lint + build green.
2. STEP 0 (design before code): write `docs/features/supermarket-pack-design.md`: for every feature below, your concrete design, the files you will touch, schema impact (prefer NO schema change; if one is needed, an additive new migration 0009+ and a DECISIONS.md entry; never edit applied migrations), new permission codes (document each in DECISIONS.md like sale.credit_override), risks, and every assumption you made where this brief is ambiguous (choose the most conservative option). Commit alone: `docs(features): supermarket pack design`. Then implement in the order below, one conventional commit per step (tests with code, docs separate). Never continue on red.
3. Hard rules still apply: money = integer piasters; quantities = integer base units; all multiply-then-divide through domain `mulDivRoundHalfUp` (no floats, no Math.round); pure parsing/validation logic lives in `src/domain` or `src/shared` (no DB/Electron/clock); SQL only in repositories; every write through existing services/stock engine (never write stock or ledger rows directly); one transaction per mutation; audit rows; Arabic messages in ar.json for every new error code; renderer talks only through typed IPC; permissions derived from the session in main.
4. Hand-check every number in test comments. Never change an expected value to make a test pass.
5. After each step append exact manual test steps to docs/manual-test-checklist.md, including items needing REAL hardware (scanner, label printer, scale) that you cannot verify. Final chat reply: commits, test counts, lint/build, done / not done.
6. If low on budget: commit only green work, add STATE AT STOP (done / next / resume commands) to docs/reports/batch-c-recovery-audit.md, commit.

## Implementation order

A. Excel/CSV import-export infrastructure + Products (adoption blocker: a supermarket has thousands of items)
B. Barcode foundation + barcode entry workflows
C. Fast scanning in POS
D. Scale (weighing) barcodes
E. Wallet payments in POS
F. Barcode label printing
G. Import/export for the other entities

---

## A. Excel import/export (everywhere it is useful, not only products)

### Common infrastructure
- One shared import/export module, reused by all entities. XLSX and CSV both. CSV: UTF-8 with BOM, `;` separator (match existing report exports). Runs in the main process; the renderer sends the chosen file path/bytes through typed IPC and gets back DTOs.
- XLSX library: evaluate and decide, record in DECISIONS.md. Constraints: works fully offline, MIT/Apache-compatible, pinned exact version, no network at runtime, reads VALUES only (never evaluate formulas/macros), limits on file size (e.g. 20 MB) and rows (e.g. 20,000) to avoid zip-bomb/memory problems. Note: the old `xlsx` package published on npm is no longer maintained there and has had security advisories; verify before choosing (alternatives: exceljs, or a vendor-supplied tarball of a maintained build).
- Import wizard (same UX for every entity): 1) choose file, 2) auto-map columns (recognize Arabic and English header names; user can remap), 3) preview with row-level validation (error/warning per row, in Arabic), 4) mode per entity (create only / update existing / both; skip or fail on duplicates), 5) confirm, 6) result report with counts (created, updated, skipped, failed) and a downloadable error file (same rows + error column).
- ATOMIC: validate everything first (dry run). Commit all-or-nothing in ONE transaction (so a 3,000-row import can never half-apply); progress feedback in the UI.
- Normalize inputs: trim; Arabic-Indic digits to Western (existing `src/shared/digits.ts`); phone formats; empty vs zero; decimals with `,` or `.`; prices in EGP converted to integer piasters with exact string-based parsing (never via float multiplication).
- Downloadable TEMPLATE file per entity with headers, a sample row, and a "notes" sheet explaining each column (Arabic).
- Permissions: new `data.import` (owner, manager) and `data.export` (owner, manager; cashier none); price/cost columns in an import additionally require `product.price_change` / `product.cost_change`, otherwise those columns are ignored with a visible warning. Every import writes one audit row (entity, file name, counts, mode; never file content).
- IMPORTANT gotcha: Excel destroys barcodes (leading zeros dropped, long numbers shown as 6.22E+12). The barcode/SKU/phone columns must be read as TEXT; detect scientific notation or floating values and flag the row with a clear Arabic error ("الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص") instead of importing garbage. The exported/template files must format these columns as text.

### Products import/export (first deliverable)
- Columns: name, category (auto-create if missing, with confirmation count), SKU, unit name, selling price, cost, barcode(s) (multiple separated by `;`), low-stock threshold, product type (counted/weighed), expiry tracking flag (only if feature on), scale PLU (after step D), opening stock quantity.
- Packaging units: second sheet (or repeated rows) with product key (barcode/SKU), unit name, quantity per unit, price, barcode.
- Match key for updates: barcode first, then SKU. NEVER match by name alone (too error-prone); name duplicates produce a warning.
- Opening stock: must go through the stock engine as an incoming movement with value = qty x cost (per existing `calculateIncomingValueAtAverage`/default-cost rules), reason "opening balance", respecting invariants I1/I2 and normalization. Document it in DECISIONS.md. Re-importing the same sheet must not double the stock: opening stock is only applied when on-hand is zero and no movements exist for that product, otherwise warn and skip (or require an explicit "adjust to this quantity" mode that creates a count/adjustment).
- Prices/costs: integer piasters; reject negatives; warn when price < cost.
- Weighted products: quantities in base units (grams/ml) via existing `qty_scale`/`price_unit_qty_base` rules; check the schema constraints (qty_scale = 0 implies price_unit_qty_base = 1).
- Export: all products with current stock, value, prices, barcodes, category (same columns as the import template so export -> edit -> import round-trips).
- Bulk price update: a dedicated flow "تحديث الأسعار" using the same wizard (match by barcode/SKU, new price/cost columns only), with a before/after preview and audit of changed fields. Valuable in a high-inflation market.

### Other places that need Excel (do in step G, same infrastructure)
- Customers: import (name, phone, address, credit limit) and export with derived balance. Opening debts: balances are derived from documents in the frozen schema, so an "opening balance" cannot be stored as a number. Investigate; if it cannot be modeled without breaking invariants and `db:verify`, DO NOT implement it, and list it under "Open decisions" in the design doc with the options (e.g. a dedicated opening-balance document type via new migration) for the human to choose.
- Suppliers: same as customers.
- Purchase invoice lines import: fill the lines of the purchase dialog from a supplier's sheet (barcode/SKU, quantity, cost); the user reviews and saves manually; unknown barcodes listed for quick product creation.
- Stock count: export a count sheet (blind option that hides expected quantities); import counted quantities into a DRAFT count (never posts automatically).
- Exports (XLSX + CSV, filtered by the screen's current date range/search): sales history, purchases, returns, expenses, shift history, customer statement, supplier statement, current stock and valuation, audit log (CSV already required by the schema), and every existing report (they already have CSV: add XLSX).
- Put the Import/Export buttons in each relevant screen's toolbar (consistent placement) plus a central "استيراد وتصدير" page that lists all entities and templates.

---

## B. Barcode foundation + how barcodes enter the system

Barcodes are the most important data in a supermarket. There must be several fast ways to get them in:
1. By scanner on the product dialog: the barcode field accepts a scan (scanner types digits + Enter); pressing Enter saves the barcode and keeps focus ready for the next one.
2. Bulk via Excel (step A).
3. Unknown barcode scanned in POS: non-blocking prompt "الباركود غير موجود. إضافة منتج جديد؟" (owner/manager only; cashier just sees the error) opening the product dialog with the barcode prefilled; after saving, the pending sale continues and the item is added.
4. Unknown barcode scanned in the purchase dialog or stock count: same quick-create.
5. Items without any barcode (loose, repacked, local products): generate an INTERNAL barcode and print a label (step F).

Rules: normalize (trim, Western digits, no spaces); validate EAN-13/EAN-8/UPC-A check digits when the code is numeric and of that length (warn, do not block: some local labels are invalid but real); keep leading zeros; one barcode belongs to exactly one product/unit (existing unique index: surface the duplicate with the product name it already belongs to); a product can have several barcodes; packaging-unit barcodes (carton) resolve to the unit and its quantity in base units. Build an in-memory index barcode -> product/unit in main (or renderer) refreshed on any catalog change so a lookup is instant. Prefix collision protection: scale prefixes (step D) and internal prefixes must not overlap; validate in settings.

## C. Fast scanning in POS

- A USB scanner behaves as a keyboard: very fast keystrokes ending with Enter (sometimes Tab). Implement a scan detector: characters arriving faster than ~50 ms apart, minimum length ~4, terminated by Enter/Tab, are treated as a scan wherever the focus is (also when focus is on the cart or a quantity field), and must never leak into a text input. Real typing stays normal. Make the thresholds configurable in settings with sane defaults. Use `event.code`/digit handling so an Arabic keyboard layout does not corrupt digits.
- On scan: instant lookup; found: add 1 to the cart (increment the existing line when the same product is already there; setting to disable merging), highlight the line, show a large "last item" card (name, price, line total) and the running total; sound feedback (short success beep; different error beep) using bundled audio or WebAudio, fully offline, with a mute setting. Not found: error beep + clear Arabic message + quick-create (owner/manager).
- Multiplier mode: typing `5*` (or a dedicated key) then scanning adds 5. Keyboard shortcuts documented in docs/design_system/design_system.md: keep existing ones, add: focus search, change quantity of the last line, remove last line, repeat last item.
- Scans while a modal (payment) is open: ignored with a subtle notice (never silently added to the cart).
- Performance target on a weak PC: scan to cart update under ~100 ms; no IPC round trip per scan if the index is local. Tests: scan detector logic with simulated key timings (pure function), lookup, merge, multiplier, not-found, modal-open cases.
- Human will test with a real scanner: list exact steps and expected behavior in the manual checklist.

## D. Scale (weighing) barcodes

Many Egyptian supermarkets/butchers use label-printing scales (DIGI, CAS, Mettler-type). The scale prints a barcode that encodes the item and the weight or price; the POS must decode it. Formats differ per shop, so make the parser CONFIGURABLE (Settings, owner only):
- enabled flag; prefix list (default `20`); item-code (PLU) length (default 5); value length (default 5); value type: `weight_grams` or `price_piasters` (price-embedded labels usually encode the price with two decimals); check digit validation on/off (EAN-13).
- Product gets a scale PLU (unique, nullable). If the frozen schema has no suitable column, add `products.scale_plu` via a new additive migration + DECISIONS.md entry + `db:verify`/tests still green. Excel import/export includes it.
- Decoding: weight-embedded: qty_base = grams (value) for a product priced per `price_unit_qty_base` (e.g. 1000 g): line price via `mulDivRoundHalfUp(unit_price, qty_base, price_unit_qty_base)`. Price-embedded: the label price is authoritative for the receipt line total; derive quantity with `mulDivRoundHalfUp(price, price_unit_qty_base, unit_price)` and warn (setting) when the derived weight rounds inexactly; prefer weight-embedded and document why.
- Hand-checked vectors (config: prefix `20`, PLU 5 digits, value 5 digits, EAN-13 check):
  - `2000123003504` = prefix 20, PLU 00123, value 00350 (350 g), check digit 4 (weights 1,3,1,3...: sum of first 12 digits weighted = 26, check = (10 - 26 mod 10) mod 10 = 4). With price 12000 piasters/kg -> line subtotal 4200 piasters.
  - `2000123042008` = prefix 20, PLU 00123, value 04200 as price (42.00 EGP), check 8 (weighted sum 22). With price 12000/kg -> quantity = 4200 x 1000 / 12000 = 350 g.
  - Wrong check digit, unknown PLU, product not weighed, value 0, prefix not configured: each returns a typed error (Arabic message), never a crash.
- A scale barcode is recognized BEFORE the normal barcode lookup only if it matches the configured prefix/length; otherwise it falls through to the normal lookup.
- Cashier can still type the weight manually (existing flow) for shops without label scales. Serial-port scale integration is OUT of scope.
- Unit tests for the parser (pure), config validation (prefix overlap with internal prefix), and POS integration. Real-scale testing is the human's job: add a checklist item to print a label from his scale and scan it.

## E. Wallet payments in POS

- The frozen schema already has payment methods `cash` / `card` / `wallet`; this step is mostly the POS payment dialog and reporting.
- In the payment dialog the cashier picks, per tender, how the customer paid: نقدي / بطاقة / محفظة إلكترونية (only methods enabled in settings `payment_methods`). Split payments allowed (e.g. cash + wallet), existing domain rules stay: change only from cash, non-cash cannot exceed the remaining amount.
- Wallet details: optional provider (Vodafone Cash, InstaPay, Orange, Etisalat, WE, other; list editable in settings) and optional transaction reference number. Store them without breaking the append-only ledger (check whether the existing ledger has a reference/note column; otherwise an additive nullable column via a new migration; document in DECISIONS.md). For non-cash tenders show a confirm step "تأكدت من وصول المبلغ" (setting, default on) before completing.
- Keyboard-first: quick keys to choose cash/card/wallet; big total and remaining; exact-amount button for non-cash.
- Expected shift cash must stay cash-only (existing rule); reports show totals per method and per wallet provider; the receipt prints the method(s); customer receipts and supplier payments also allow wallet. Tests for split payments with wallet, shift expected cash unaffected, report totals, and verifyDatabase green in the scenario test (extend it).

## F. Barcode label printing

What it is (for the human): small sticker labels with a barcode, product name and price, stuck on products that have no barcode (loose/repacked/local items) or used as shelf price tags. Needs a label printer (cheap thermal label printer) or normal A4 sticker sheets.
- Screen "طباعة ملصقات": pick products (search/scan, multi-select, or from the products list), number of copies per product, label template: size (default 50x30 mm; also 40x25 and 58 mm roll; plus A4 sheet grids such as 3x8), fields (name, price, barcode, optional SKU/expiry date), barcode symbology (EAN-13 when the code is valid EAN-13, otherwise Code 128).
- v1 printing path: render HTML/SVG labels (barcode drawn locally with a small bundled library or own SVG encoder; Cairo font; correct quiet zones and minimum bar width for scanning at 203 dpi) and print silently through the Windows driver with the existing printing code. No raw TSPL/ZPL in v1. Print preview + test label. Configurable label size and margins stored per printer.
- Internal barcode generator: for products with no barcode, generate an EAN-13 with an internal prefix (default `29`, must not overlap the scale prefix from step D) + sequential number + check digit; sequence kept safely (never reused; use the existing sequences mechanism or an additive setting) and saved as a normal barcode of the product (audited). Also "print labels for received items" shortcut from a purchase invoice.
- Tests: check-digit/EAN generator (pure), layout math for sheet grids (pure), no prefix collision, label data builder. Human tests the physical print and scanning the printed label with the real scanner.

## G. Remaining Excel/CSV flows
Implement the "Other places" list from step A with the same wizard and tests, one commit per entity.

---

## Definition of done
- Round-trip works: export products -> edit in Excel -> import -> no data corruption (barcodes keep leading zeros), atomic, audited.
- A 3,000-row product import completes in a reasonable time on a weak PC and either fully applies or fully fails.
- A scanned barcode reaches the cart without ever typing into a field; scale labels decode correctly; wallet payments are recorded and reported; labels print.
- `verifyDatabase` stays green in the extended scenario test; docs updated (docs/services.md, docs/ipc.md, docs/ui.md, DECISIONS.md); manual checklist lists every real-hardware test.