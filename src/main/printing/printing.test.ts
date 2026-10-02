import { describe, expect, it } from 'vitest'
import { createReceiptHtml } from './receipt-template'

describe('createReceiptHtml', () => {
  it('creates a local Arabic RTL receipt with isolated money', () => {
    const html = createReceiptHtml({
      shopName: 'متجر <اختبار>',
      invoiceNumber: 'TEST-0001',
      printedAt: '2026/10/02 06:00',
      totalPiasters: 1250,
    })

    expect(html).toContain('<html lang="ar" dir="rtl">')
    expect(html).toContain('متجر &lt;اختبار&gt;')
    expect(html).toContain('<bdi>12.50 ج.م</bdi>')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })
})
