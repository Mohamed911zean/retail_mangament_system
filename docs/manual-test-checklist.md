# Manual Test Checklist (Phase 2 screens)

Hand-run by Mohamed in the real app. The AI never launches the real window, so
every flow below is unverified in the GUI until it is ticked here.

## Screen 1 — Products + Categories (`c37b15c`)

Setup: log in as owner/manager on a dev database (never userData).

### Product list
- [ ✔ ] Open المنتجات from the sidebar: table shows seeded products, or the
      "لا توجد منتجات بعد" empty state with a "منتج جديد" button when empty.
- [ ✔ ] Type in the search box: filters by Arabic name fragment, by SKU in any
      case, and by barcode digits. Clearing the box restores the full list.
- [ ✔ ] Pick a category in the filter: only its products show; "كل التصنيفات"
      restores all.
- [ ✔ ] A product with zero stock shows a "نفد" badge; a product at/below its
      threshold shows "منخفض"; others show no badge.

### Create / edit
- [ ✔ ] "منتج جديد" opens the dialog. Saving with an empty name shows
      "اكتب اسم المنتج" and does not save.
- [ ✔ ] Create a counted product (name, category, SKU, price, cost): toast
      "تم حفظ المنتج" appears and the dialog switches to edit mode.
- [ ✔ ] In edit mode add a packaging unit (e.g. كرتونة = 12, price) and a
      barcode: both appear in the dialog without closing it.
- [ ✔ ] Remove a unit and a barcode: inline yes/no asks first; removal works.
- [ ✔ ] Close and reopen the product: all saved values are there.
- [ ✔ ] When `features.weighted_items` is on, the نوع المنتج selector appears;
      create a موزون product and check its stock shows in kg.
- [ ✔ ] When `features.expiry_batches` is on, the تتبع الصلاحية switch appears.
- [ ✔ ] Edit price and cost as owner: saves. (Cashier: no add/edit/delete
      buttons at all; cost column hidden.)

### Categories
- [ ✔ ] "إدارة التصنيفات": add a category, rename it inline, delete it inline
      (yes/no on the row). Products of a deleted category show "—".

### Delete
- [ ✔ ] Delete a product with no stock: confirm names the product; toast
      "تم حذف المنتج"; row disappears.
- [ ✔ ] Delete a product that has stock: the dialog stays open with
      "لا يمكن حذف منتج يوجد له مخزون".

### NOT verified by the AI in the real GUI
- RTL layout of the table/dialog at 1280×720 and 1366×768.
- Search autofocus and full keyboard flow (Tab order, Esc closes dialogs).
- Money/Qty reformatting inside this dialog on a real keyboard.
- Cairo woff2 still missing: fallback font renders.
- Lists over ~200 rows are not virtualized yet; check scroll smoothness.

## Screen 2 — Suppliers + Purchases (`ee285b2`, IPC `2b13225` + `e30aaf6`)

Setup: log in as owner/manager on a dev database. Seed at least one product
with a cost price. With shifts enabled, open a shift before cash payments.

### Purchase invoices tab (المشتريات)
- [ ✔ ] Empty state shows "لا توجد فواتير شراء بعد" with a "فاتورة شراء جديدة"
      button when no invoices exist.
- [ ✔ ] "فاتورة شراء جديدة": pick a supplier, add 2 lines (a counted product and
      a weighed one), pay part of the total in cash: the paid/due preview
      matches, save shows "تم حفظ فاتورة الشراء", the row appears with a
      "جزئية" badge and the due amount.
- [ ✔ ] Save an invoice with no payment and a supplier: "آجلة" badge, due equals
      the total.
- [ ✔ ] Save without a supplier and without full payment: inline hint
      "بدون مورد يجب دفع كامل المبلغ" and save stays disabled.
- [ ✔ ] Search filters by invoice number and by supplier name.
- [ ✔ ]  "التفاصيل" opens the invoice: header (number, supplier, date, status),
      lines with quantities and totals, paid/due footer.
- [ ✔ ] Void: type a reason, confirm twice. Toast "تم إلغاء الفاتورة", badge
      becomes "ملغاة". Voiding again is refused.
- [ ✔ ] Void with an empty reason is blocked with "اكتب سبب الإلغاء".
- [ ✔ ] Void a purchase whose goods were already sold (with
      `features.allow_negative_stock` off): inline "الكمية المتاحة في المخزون
      غير كافية", invoice stays completed.
- [ ✔ ] Cashier role: no "فاتورة شراء جديدة" button, invoice list is read-only.

### Suppliers tab (الموردون)
- [ ✔ ] "مورد جديد": name required ("اكتب اسم المورد"); saves with toast.
- [ ✔ ] Supplier row shows the derived balance; zero shows "لا يوجد مستحق".
- [ ✔ ] "بيانات المورد": balance header, "دفع للمورد" (amount + method +
      optional note), statement rows with date, type and amount.
- [ ✔ ] Record a card payment: balance drops, new row appears in the statement.
- [ ✔ ] Reverse a payment (owner/manager): inline reason + yes/no, toast
      "تم عكس الدفعة", row gets "معكوسة" badge, balance restored.
- [ ✔ ] Reversing the same row again is refused ("عكس مكرر" server error inline).
- [ ✔ ] Cashier role: no add/edit/delete buttons; pay section visible (service
      permits recording), reversal buttons hidden.
- [ ✔ ] Edit + delete supplier with confirms; deleting a supplier with a balance
      shows the "لهذا المورد رصيد مستحق:" warning in the confirm.

### NOT verified by the AI in the real GUI
- RTL layout of both tabs and all four dialogs at 1280×720 and 1366×768.
- Full keyboard flow (Tab order, Esc, Enter in category-style inputs).
- Expiry/batch line fields (only visible with `features.expiry_batches` on).
- Supplier with many statement rows: scroll behaviour inside the dialog.

## Screen 3 — Customers (`be6c2d1`, no new IPC)

Setup: log in as owner/manager. Seed a customer with a credit limit, or create
one below. Make a credit/POS sale against them to see a balance.

### Customer list
- [ ✔ ] Empty state shows "لا يوجد عملاء بعد" with "عميل جديد" when empty.
- [ ✔ ] Search filters by Arabic name fragment and by phone digits
      (Western and Arabic-Indic both match).
- [ ✔ ] Row shows balance: amount owed, "لا يوجد مستحق" when zero,
      amount + "رصيد دائن للعميل" when overpaid.
- [ ✔ ] Credit limit column: "بدون حد", "بدون آجل (نقدي فقط)", or the amount.
- [ ✔ ] Cashier role: list is read-only (no add/edit/details buttons).

### Create / edit
- [ ✔ ] "عميل جديد": name required; phone/address optional; limit defaults to
      "بدون حد". Saves with toast "تم حفظ العميل".
- [ ]✔  Edit: set limit to "مبلغ مخصص" 5000, save, reopen: shows the amount.
- [ ✔ ] Set limit to "بدون آجل": POS credit sales to this customer are refused.

### Account dialog (بيانات العميل)
- [ ✔ ] Header shows balance, limit, and phone.
- [ ✔ ] "تحصيل من العميل": amount + method + note → toast "تم تسجيل التحصيل",
      balance drops, new "سند قبض" row in the statement.
- [ ✔ ] Statement rows show date, type (سند قبض / دفعة فاتورة / مرتجع للحساب /
      عكس قيد) and amount; reversals carry "معكوسة".
- [ ✔ ] Reverse a receipt (owner/manager): inline reason + yes/no, toast
      "تم عكس السند", balance restored.
- [ ✔ ] Document rows (دفعة فاتورة) show no reverse button — they belong to
      their invoice.
- [ ✔ ] Cashier: reversal buttons hidden.

### NOT verified by the AI in the real GUI
- RTL layout of the list and both dialogs at 1280×720 and 1366×768.
- Full keyboard flow (Tab order, Esc, Enter-to-save).

## Screen 4 — Inventory (`b34531b`, IPC `755121b`)

Setup: log in as owner/manager. Seed products with stock (via purchases),
one below its low-stock threshold, one with trackExpiry and a dated batch.

### Stock tab (الأرصدة)
- [ ] Table shows every product with on-hand quantity and value, plus the
      total stock value card.
- [ ] Search filters by name/SKU/barcode; "منخفض" shows low + out-of-stock;
      "يحتاج مراجعة" shows negative and zero-value rows only.
- [ ] Badges: "نافد" (zero), "منخفض" (at/below threshold), "سالب" (negative),
      "يحتاج مراجعة" (positive qty, no value).
- [ ] "تسوية": pick زيادة/نقص, quantity, reason → toast "تم حفظ التسوية",
      row updates. Empty reason or zero quantity is blocked inline.
- [ ] "تالف": quantity + reason → toast "تم تسجيل التالف", stock drops.
- [ ] Cashier role: no adjust/damage buttons.

### Counts tab (الجرد)
- [ ] "جرد جديد": notes + "بدء الجرد" opens a draft.
- [ ] Add lines: product picker (already-counted products excluded), expected
      shown from the ledger, counted typed → row with signed difference.
- [ ] "ترحيل الجرد" asks twice (yes/no); toast "تم ترحيل الجرد"; badge
      becomes "مرحّل"; stock tab reflects the differences.
- [ ] Posting with no lines is disabled. Reopening a posted count is read-only.
- [ ] Cashier role: no "جرد جديد"; drafts cannot be opened for editing.

### Expiry tab (الصلاحية, only with `features.expiry_batches`)
- [ ] Lists batches with expiry, earliest first; expired rows "منتهية",
      within-30-days rows "قريبة الانتهاء".
- [ ] Tab hidden when the feature is off.

### NOT verified by the AI in the real GUI
- RTL layout of all tabs and dialogs at 1280×720 and 1366×768.
- Full keyboard flow. Expiry "now" is page-load time (badges refresh on reload).

## Screen 5 — Treasury (`3b3993b`, IPC `6bf5358`)

Setup: log in as owner/manager. Open a shift in the POS screen first for cash
moves and cash expenses.

### Expenses tab (المصروفات)
- [ ] Empty state shows "لا توجد مصروفات بعد" with "مصروف جديد".
- [ ] "مصروف جديد": category + description required, amount, method → toast
      "تم تسجيل المصروف", row appears with "مسجّل" badge.
- [ ] Without an open shift: info "لا توجد وردية مفتوحة..." instead of a form.
- [ ] Search filters by category and description.
- [ ] Void (owner/manager): reason required, yes/no confirm, toast
      "تم إلغاء المصروف", badge becomes "ملغي".
- [ ] "إيداع نقدية" / "سحب نقدية": amount + mandatory reason → toast
      "تم تسجيل الحركة". Empty reason is blocked.

### Shifts tab (سجل الورديات)
- [ ] Lists shifts newest-first: opened/closed dates, opening, expected,
      counted, difference + badge (مطابق/زيادة/عجز), status badge.
- [ ] Open shift shows "مفتوحة" with "—" for expected/counted/difference.
- [ ] Empty state "لا توجد ورديات بعد" before the first shift.
- [ ] Close a shift in POS with a counted mismatch, reopen this tab: the
      difference and badge match the POS reconciliation.

### NOT verified by the AI in the real GUI
- RTL layout of both tabs and all dialogs at 1280×720 and 1366×768.
- Full keyboard flow. Cash-move history has no list (covered by shift close).

## Screen 6 — Reports (`7a8ce7a`, IPC `1e4a4fe`)

Setup: log in as owner/manager. Seed a purchase, a cash sale, and a supplier
balance (see Screen 2 steps). Set the PC timezone to Africa/Cairo.

### Sales + profit tabs
- [ ] Sales tab shows today: invoice count, revenue, paid, due + per-day rows.
- [ ] Presets (اليوم/أمس/آخر ٧ أيام/هذا الشهر) and custom من/إلى change the
      figures; a voided invoice never appears in revenue.
- [ ] Profit tab: revenue, discounts, cost, gross profit, margin %, line and
      return counts. Hand-check one sale: revenue − cost = profit.
- [ ] Invalid range (empty date) keeps the previous figures, no crash.

### Stock + balances tabs
- [ ] Stock tab: total value card, low-stock table, review list, expired
      batches (after loading them with the الصلاحية button when the feature
      is on).
- [ ] Balances tab: receivables/payables cards + owing customers and payable
      suppliers. Zero-balance parties are hidden.
- [ ] CSV export per tab downloads a file that opens in Excel with Arabic
      intact (BOM + `;` separators).
- [ ] Print button opens the system print dialog with only the report visible
      (no sidebar, header, or filters).

### NOT verified by the AI in the real GUI
- RTL layout of all tabs and tables at 1280×720 and 1366×768.
- Day boundaries use device-local time (assumed Cairo); verify on the shop PC.
- Real Excel open + real printer output.

## Screen 7 — Settings + Users + Backup/Restore + license (`da3fb83`, no new IPC)

Setup: log in as owner. The Settings page is hidden for cashiers.

### Users (المستخدمون)
- [ ] Table shows username, display name, role badge, active badge, last login
      ("أبداً" when never).
- [ ] "مستخدم جديد": username/display/role/password (4+ chars) → toast
      "تم حفظ المستخدم". Duplicate username shows the taken-name error inline.
- [ ] Edit: display name, role, active toggle. As manager, the owner role is
      not offered and owners cannot be edited.
- [ ] Change password per user → toast "تم تغيير كلمة المرور"; log in with it.
- [ ] Deactivate (not your own account — the button is replaced by the reason):
      confirm names the user; row becomes "متوقف"; login refused afterwards.

### Backup/restore + license
- [ ] Restore confirm now carries the sequence-jump warning
      ("ستقفز أرقام الفواتير القادمة للأمام...").
- [ ] License with ≤30 days left shows "ينتهي الترخيص خلال N يوم"; >30 days
      shows only the expiry date; expired shows the expired state.

### NOT verified by the AI in the real GUI
- RTL layout of the users table and dialogs at 1280×720 and 1366×768.
- Real restore round-trip on the shop PC.

## Item 1 — Purchase expiry date picker

- [ ] In "فاتورة شراء جديدة", the expiry field is a calendar picker (no typed
      format). Picking a date saves the line; the stored `expiryAt` equals the
      picked day (check via the expiry list in المخزون).
- [ ] Clearing the picker saves the line with no expiry.
- [ ] A half-typed/unparseable picker value blocks adding the line with
      "تاريخ غير صالح" instead of storing a wrong date.

## Item 2 — Void metadata on canceled purchase invoices

- [ ] Open التفاصيل on a canceled (ملغاة) invoice: a section shows the cancel
      reason, who canceled it (display name), and when.
- [ ] Completed invoices show no such section.
- [ ] Unknown/deleted voiding user shows "—" instead of a blank.


## ----- SOME NOTICIES : 

### Purchase Dialog 
-- in Purchase Dialog when buying new stock for a product the Expiry date is hard to understand and sometimes the owner will make mistakes on it change it to calender date instead but make sure Expiry dates store like the old with no errors or new changes on the main functions ---[we will use it in future by making notifications for near to expiry products] ---

### TABLES UI ISSUE
--- ALL the tables in the system have an UI issue 

### cancelling purchase invoice 
--- when i click on the details button on an canceled invoice the reason of the cancelling should appear in the details dialog