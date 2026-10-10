# Manual Test Checklist (Phase 2 screens)

Hand-run by Mohamed in the real app. The AI never launches the real window, so
every flow below is unverified in the GUI until it is ticked here.

## Screen 1 — Products + Categories (`c37b15c`)

Setup: log in as owner/manager on a dev database (never userData).

### Product list
- [ ] Open المنتجات from the sidebar: table shows seeded products, or the
      "لا توجد منتجات بعد" empty state with a "منتج جديد" button when empty.
- [ ] Type in the search box: filters by Arabic name fragment, by SKU in any
      case, and by barcode digits. Clearing the box restores the full list.
- [ ] Pick a category in the filter: only its products show; "كل التصنيفات"
      restores all.
- [ ] A product with zero stock shows a "نفد" badge; a product at/below its
      threshold shows "منخفض"; others show no badge.

### Create / edit
- [ ] "منتج جديد" opens the dialog. Saving with an empty name shows
      "اكتب اسم المنتج" and does not save.
- [ ] Create a counted product (name, category, SKU, price, cost): toast
      "تم حفظ المنتج" appears and the dialog switches to edit mode.
- [ ] In edit mode add a packaging unit (e.g. كرتونة = 12, price) and a
      barcode: both appear in the dialog without closing it.
- [ ] Remove a unit and a barcode: inline yes/no asks first; removal works.
- [ ] Close and reopen the product: all saved values are there.
- [ ] When `features.weighted_items` is on, the نوع المنتج selector appears;
      create a موزون product and check its stock shows in kg.
- [ ] When `features.expiry_batches` is on, the تتبع الصلاحية switch appears.
- [ ] Edit price and cost as owner: saves. (Cashier: no add/edit/delete
      buttons at all; cost column hidden.)

### Categories
- [ ] "إدارة التصنيفات": add a category, rename it inline, delete it inline
      (yes/no on the row). Products of a deleted category show "—".

### Delete
- [ ] Delete a product with no stock: confirm names the product; toast
      "تم حذف المنتج"; row disappears.
- [ ] Delete a product that has stock: the dialog stays open with
      "لا يمكن حذف منتج يوجد له مخزون".

### NOT verified by the AI in the real GUI
- RTL layout of the table/dialog at 1280×720 and 1366×768.
- Search autofocus and full keyboard flow (Tab order, Esc closes dialogs).
- Money/Qty reformatting inside this dialog on a real keyboard.
- Cairo woff2 still missing: fallback font renders.
- Lists over ~200 rows are not virtualized yet; check scroll smoothness.
