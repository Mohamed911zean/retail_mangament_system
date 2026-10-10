import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  MoneyInput,
  QtyInput,
  SearchInput,
  Select,
  Spinner,
  StatCard,
  Table,
  TableEmpty,
  TD,
  TextInput,
  TH,
  THead,
  Toggle,
  TRow,
} from '../components/ui'
import { BoxIcon, CartIcon, PlusIcon, TrashIcon } from '../components/icons'
import { messages } from '../i18n'
import { useToast } from '../lib/toast'

/**
 * Dev-only component gallery (design system §10), reachable from the sidebar
 * only in a dev build. It is the place to check a component in RTL, at every
 * state, and in Lite mode before it is used on a real screen.
 *
 * The Arabic strings below are *sample data* for the gallery, not UI copy — a
 * real screen takes its text from `i18n/ar.json`. This file is excluded from
 * production builds, so those strings never ship.
 */
export function DesignSystemPage() {  const [money, setMoney] = useState(1250)
  const [qty, setQty] = useState(1500)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('كولا')
  const [select, setSelect] = useState('')
  const [toggle, setToggle] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [lite, setLite] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="الوضع الخفيف" description="يوقف الحركات والظلال — نفس ما يفعله الإعداد" />
        <Toggle
          id="gallery-lite"
          label="الوضع الخفيف"
          checked={lite}
          onChange={(next) => {
            setLite(next)
            document.documentElement.dataset.lite = next ? 'true' : 'false'
          }}
        />
      </Card>

      <Card>
        <CardHeader title="الأزرار" description="المتغيرات والأحجام والحالات" />
        <div className="flex flex-wrap items-center gap-2">
          <Button>إتمام البيع</Button>
          <Button variant="secondary">ثانوي</Button>
          <Button variant="outline">إطار</Button>
          <Button variant="ghost">شفاف</Button>
          <Button variant="danger">
            <TrashIcon size={16} />
            حذف
          </Button>
          <Button disabled>معطّل</Button>
          <Button loading={busy} onClick={() => setBusy(true)}>
            {busy ? 'جارٍ الحفظ...' : 'محاكاة التحميل'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm">صغير</Button>
          <Button size="md">متوسط</Button>
          <Button size="lg">كبير</Button>
          <Button size="pos">
            <CartIcon size={24} />
            إتمام البيع
          </Button>
          <IconButton label="إضافة منتج" variant="outline">
            <PlusIcon size={20} />
          </IconButton>
          <Spinner />
        </div>
      </Card>

      <Card>
        <CardHeader title="حقول الإدخال" description="المال بالقرش والكميات بالوحدة الصغرى" />
        <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
          <Field label="الاسم" htmlFor="g-name" required helper="يظهر على الفاتورة">
            <TextInput id="g-name" value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <Field label="الباركود" htmlFor="g-barcode" error="اكتب ١٣ رقماً للباركود">
            <TextInput id="g-barcode" error dir="ltr" />
          </Field>
          <Field label="بحث" htmlFor="g-search">
            <SearchInput id="g-search" value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch('')} />
          </Field>
          <Field label="السعر" htmlFor="g-money">
            <MoneyInput id="g-money" value={money} onChange={setMoney} size="lg" />
          </Field>
          <Field label="الكمية" htmlFor="g-qty" helper="كجم — تُخزَّن بالجرام">
            <QtyInput id="g-qty" value={qty} onChange={setQty} qtyScale={3} unitName="كجم" />
          </Field>
          <Field label="الفئة" htmlFor="g-select">
            <Select
              id="g-select"
              value={select}
              onChange={setSelect}
              placeholder="اختر فئة"
              options={[
                { value: '1', label: 'مشروبات' },
                { value: '2', label: 'بقالة' },
              ]}
            />
          </Field>
          <Toggle
            id="g-toggle"
            label="تفعيل الورديات"
            checked={toggle}
            onChange={setToggle}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="الحالات" description="شارات وتنبيهات" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">مدفوع</Badge>
          <Badge tone="warning">آجل</Badge>
          <Badge tone="info">جزئي</Badge>
          <Badge tone="error">نفد</Badge>
          <Badge>ملغي</Badge>
        </div>
        <div className="mt-3 flex max-w-[720px] flex-col gap-2">
          <Alert tone="success">تم حفظ الفاتورة</Alert>
          <Alert tone="warning">المخزون وصل للحد الأدنى</Alert>
          <Alert tone="error">الكمية المتاحة في المخزون غير كافية</Alert>
          <Alert tone="info">الوضع الخفيف يوقف الظلال</Alert>
        </div>
        <div className="mt-3 max-w-[560px]">
          <EmptyState
            icon={<BoxIcon size={24} />}
            title="لا توجد منتجات بعد"
            description="أضف أول منتج ليظهر هنا"
            action={<Button>إضافة منتج</Button>}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="البطاقات" />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="مبيعات اليوم" value="1,240.00 ج.م" hint={<Badge tone="success">+12%</Badge>} />
          <StatCard label="عدد الفواتير" value="37" />
          <StatCard label="متوسط الفاتورة" value="33.51 ج.م" />
        </div>
      </Card>

      <Card>
        <CardHeader title="الجدول" />
        <Table>
          <THead>
            <TRow>
              <TH>المنتج</TH>
              <TH numeric>الكمية</TH>
              <TH numeric>السعر</TH>
              <TH numeric>الإجمالي</TH>
            </TRow>
          </THead>
          <tbody>
            <TRow>
              <TD>كولا ٣٣٠ مل</TD>
              <TD numeric>2</TD>
              <TD numeric>15.00 ج.م</TD>
              <TD numeric>30.00 ج.م</TD>
            </TRow>
            <TRow selected>
              <TD>جبنة بيضاء</TD>
              <TD numeric>0.5</TD>
              <TD numeric>120.00 ج.م</TD>
              <TD numeric>60.00 ج.م</TD>
            </TRow>
            <TableEmpty colSpan={4}>لا توجد أصناف في الفاتورة</TableEmpty>
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="الحوار والتنبيه السريع" description="Esc يغلق الحوار، والتركيز يعود لمكانه" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            فتح حوار
          </Button>
          <Button variant="outline" onClick={() => toast({ kind: 'success', message: 'تم حفظ الفاتورة' })}>
            تنبيه نجاح
          </Button>
          <Button variant="outline" onClick={() => toast({ kind: 'info', message: 'تم نسخ رمز الجهاز' })}>
            تنبيه معلومات
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="إلغاء الفاتورة رقم 1042؟"
          description="سيتم إلغاء الفاتورة وإرجاع الكميات للمخزون. لا يمكن التراجع."
          footer={
            <>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {messages.common.cancel}
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>
                إلغاء الفاتورة
              </Button>
            </>
          }
        >
          <p className="text-base text-ink">العميل: عميل نقدي — الإجمالي: 120.00 ج.م</p>
        </Dialog>
      </Card>
    </div>
  )
}

/** Loaded with `lazy()`, so it needs a default export. */
export default DesignSystemPage
