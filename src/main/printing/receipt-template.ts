export type ReceiptTemplateData = {
  shopName: string
  invoiceNumber: string
  printedAt: string
  totalPiasters: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatMoney(piasters: number): string {
  return `${(piasters / 100).toFixed(2)} ج.م`
}

export function createReceiptHtml(data: ReceiptTemplateData): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self';">
    <title>إيصال اختبار</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      :root { color: #000; background: #fff; font-family: "Segoe UI", Tahoma, sans-serif; }
      body { width: 72mm; margin: 0 auto; padding: 4mm; box-sizing: border-box; font-size: 12px; line-height: 1.6; }
      h1, p { margin: 0; }
      h1 { font-size: 18px; text-align: center; }
      .center { text-align: center; }
      .rule { border-top: 1px dashed #000; margin: 8px 0; }
      .total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
      bdi { direction: ltr; unicode-bidi: isolate; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(data.shopName)}</h1>
    <p class="center">إيصال اختبار الطباعة</p>
    <div class="rule"></div>
    <p>رقم الفاتورة: <bdi>${escapeHtml(data.invoiceNumber)}</bdi></p>
    <p>التاريخ: <bdi>${escapeHtml(data.printedAt)}</bdi></p>
    <div class="rule"></div>
    <div class="total"><span>الإجمالي</span><bdi>${formatMoney(data.totalPiasters)}</bdi></div>
    <div class="rule"></div>
    <p class="center">شكراً لزيارتكم</p>
  </body>
</html>`
}
