import type { SaleReceiptData } from '../../shared/printing'

/**
 * Receipt templates (§7). Rendered as plain HTML in a hidden window and printed
 * through the Windows driver — no ESC/POS, which is where Arabic code pages go
 * wrong on cheap thermal printers.
 *
 * Two rules hold for every template here:
 * - Everything is local. The CSP blocks remote origins, so a missing local font
 *   falls back to `Segoe UI`/`Tahoma` instead of hanging on a network request.
 * - Every value that came from the database is escaped, and every number is
 *   wrapped in `<bdi>` so a price cannot flip inside an RTL line.
 */

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

/** Signed money for adjustment rows, so a discount never prints as a surcharge. */
function formatSignedMoney(piasters: number): string {
  if (piasters === 0) return formatMoney(0)
  return `${piasters < 0 ? '-' : '+'}${formatMoney(Math.abs(piasters))}`
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self';">
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      :root { color: #000; background: #fff; font-family: "Cairo", "Segoe UI", Tahoma, sans-serif; }
      body { width: 72mm; margin: 0 auto; padding: 4mm; box-sizing: border-box; font-size: 12px; line-height: 1.6; }
      h1, p { margin: 0; }
      h1 { font-size: 18px; text-align: center; }
      .center { text-align: center; }
      .muted { color: #333; }
      .rule { border-top: 1px dashed #000; margin: 8px 0; }
      .total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
      .row { display: flex; justify-content: space-between; gap: 6px; }
      .row span:first-child { flex: 1; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 2px 0; font-weight: 400; text-align: start; vertical-align: top; }
      th { border-bottom: 1px solid #000; font-size: 11px; }
      td.qty, th.qty { width: 16mm; }
      td.money, th.money { width: 20mm; text-align: end; }
      bdi { direction: ltr; unicode-bidi: isolate; }
    </style>
  </head>
  <body>
${body}
  </body>
</html>`
}

export function createReceiptHtml(data: ReceiptTemplateData): string {
  return pageShell(
    'إيصال اختبار',
    `    <h1>${escapeHtml(data.shopName)}</h1>
    <p class="center">إيصال اختبار الطباعة</p>
    <div class="rule"></div>
    <p>رقم الفاتورة: <bdi>${escapeHtml(data.invoiceNumber)}</bdi></p>
    <p>التاريخ: <bdi>${escapeHtml(data.printedAt)}</bdi></p>
    <div class="rule"></div>
    <div class="total"><span>الإجمالي</span><bdi>${formatMoney(data.totalPiasters)}</bdi></div>
    <div class="rule"></div>
    <p class="center">شكراً لزيارتكم</p>`,
  )
}

/**
 * The sale receipt. Rows are printed in cart order; money is right-aligned and
 * isolated, and the totals block only shows a line when it is not zero, so a
 * simple cash sale stays short enough for an 80mm roll.
 */
export function createSaleReceiptHtml(data: SaleReceiptData): string {
  const itemRows = data.items
    .map(
      (item) => `        <tr>
          <td>${escapeHtml(item.productName)}</td>
          <td class="qty"><bdi>${escapeHtml(item.qtyText)}</bdi> ${escapeHtml(item.unitName)}</td>
          <td class="money"><bdi>${formatMoney(item.lineTotalPiasters)}</bdi></td>
        </tr>`,
    )
    .join('\n')

  const summaryRow = (label: string, piasters: number): string =>
    `    <div class="row"><span>${label}</span><bdi>${formatMoney(piasters)}</bdi></div>`

  const optionalRows: string[] = []
  if (data.subtotalPiasters !== data.totalPiasters) optionalRows.push(summaryRow('المجموع قبل الخصم', data.subtotalPiasters))
  if (data.discountPiasters > 0) optionalRows.push(summaryRow('الخصم', -data.discountPiasters))
  if (data.taxPiasters > 0) optionalRows.push(summaryRow('منها ضريبة', data.taxPiasters))
  if (data.roundingAdjustmentPiasters !== 0) {
    optionalRows.push(
      `    <div class="row"><span>التقريب</span><bdi>${formatSignedMoney(data.roundingAdjustmentPiasters)}</bdi></div>`,
    )
  }

  const paymentRows: string[] = [
    `    <div class="row"><span>المدفوع</span><bdi>${formatMoney(data.paidPiasters)}</bdi></div>`,
  ]
  if (data.changePiasters > 0) paymentRows.push(`    <div class="row"><span>الباقي</span><bdi>${formatMoney(data.changePiasters)}</bdi></div>`)
  if (data.duePiasters > 0) {
    paymentRows.push(
      `    <div class="row"><span>المتبقي (آجل)</span><bdi>${formatMoney(data.duePiasters)}</bdi></div>`,
    )
  }

  const customerRow =
    data.customerName === null ? '' : `    <p>العميل: ${escapeHtml(data.customerName)}</p>\n`

  return pageShell(
    `فاتورة ${data.invoiceNumber}`,
    `    <h1>${escapeHtml(data.shopName)}</h1>
    <p class="center muted">فاتورة ضريبية مبسطة</p>
    <div class="rule"></div>
    <p>رقم الفاتورة: <bdi>${escapeHtml(data.invoiceNumber)}</bdi></p>
    <p>التاريخ: <bdi>${escapeHtml(data.occurredAtText)}</bdi></p>
${customerRow}    <div class="rule"></div>
    <table>
      <thead>
        <tr><th>الصنف</th><th class="qty">الكمية</th><th class="money">الإجمالي</th></tr>
      </thead>
      <tbody>
${itemRows}
      </tbody>
    </table>
    <div class="rule"></div>
${optionalRows.join('\n')}${optionalRows.length > 0 ? '\n' : ''}    <div class="total"><span>الإجمالي</span><bdi>${formatMoney(data.totalPiasters)}</bdi></div>
    <div class="rule"></div>
${paymentRows.join('\n')}
    <div class="rule"></div>
    <p class="center">شكراً لزيارتكم</p>`,
  )
}
