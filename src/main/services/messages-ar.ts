/**
 * Arabic text for failures raised in the main process, where there is no i18n
 * runtime (dialogs, logs, licence and backup screens).
 *
 * This table mirrors the `errors` block of `src/renderer/i18n/ar.json`, which is
 * what the UI renders. `src/main/ipc/error-messages.test.ts` keeps the two in
 * sync and also fails when a service failure is reported with a code that has no
 * message here, so a new failure can never reach the cashier as a raw key.
 */
export const arabicServiceMessages = {
  'errors.permission_denied': 'لا تملك صلاحية تنفيذ هذه العملية',
  'errors.not_found': 'السجل المطلوب غير موجود',
  'errors.invalid_input': 'البيانات المدخلة غير صالحة',
  'errors.database_error': 'تعذر حفظ البيانات في قاعدة البيانات',
  'errors.settings_error': 'تعذر حفظ إعدادات التطبيق',
  'errors.fault_injected': 'فشل الاختبار المحقون',
  'errors.insufficient_stock': 'الكمية المتاحة في المخزون غير كافية',
  'errors.invalid_payment': 'بيانات الدفع غير صالحة',
  'errors.invalid_shift_state': 'يرجى فتح وردية قبل تنفيذ هذه العملية',
  'errors.shift_already_open': 'يوجد وردية مفتوحة بالفعل',
  'errors.shift_not_open': 'لا توجد وردية مفتوحة حالياً',
  'errors.document_already_voided': 'هذه الوثيقة ملغاة مسبقاً',
  'errors.void_blocked_by_returns': 'يجب إلغاء جميع مرتجعات هذه الفاتورة أولاً',
  'errors.return_exceeds_original': 'الكمية المرتجعة تتجاوز الكمية الأصلية',
  'errors.ledger_invariant_violation': 'خلل في دفتر حركات المخزون',
  'errors.overflow': 'القيمة تتجاوز الحد المسموح به',
  'errors.invalid_money': 'قيمة مالية غير صالحة',
  'errors.invalid_quantity': 'كمية غير صالحة',
  'errors.username_taken': 'اسم المستخدم مستخدم بالفعل',
  'errors.wrong_password': 'كلمة المرور غير صحيحة',
  'errors.user_inactive': 'الحساب موقوف، تواصل مع المالك',
  'errors.invalid_payment_allocation': 'توزيع الدفعات غير صالح',
  'errors.stock_count_not_draft': 'لا يمكن تعديل عدّة مخزون بعد نشرها',
  'errors.expense_invalid_amount': 'قيمة المصروف يجب أن تكون أكبر من صفر',
  'errors.product_has_stock': 'لا يمكن حذف منتج يوجد له مخزون',
  'errors.product_has_movements': 'لا يمكن تغيير وحدة القياس أو معامل الكمية بعد وجود حركات على الصنف',
  'errors.credit_limit_exceeded': 'تجاوزت الحد الائتماني للعميل، سجّل دفعة أو اطلب موافقة المدير',
  'errors.reversal_already_exists': 'تم عكس هذه العملية مسبقاً',
  'errors.invalid_reversal_target': 'لا يمكن عكس هذه العملية',
  'errors.not_authenticated': 'يجب تسجيل الدخول لتنفيذ هذه العملية',
  'errors.read_only_mode': 'التطبيق في وضع القراءة فقط. فعّل الترخيص للمتابعة',
  'errors.internal_error': 'حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم',
  'errors.unknown_channel': 'طلب غير معروف. أعد تشغيل التطبيق',
  'errors.setup_already_completed': 'تم إنشاء حساب المالك مسبقاً، سجّل الدخول باسمك وكلمة المرور',
  'errors.customer_has_balance': 'لا يمكن حذف عميل عليه رصيد مستحق، سجّل دفعة أولاً',
} as const
