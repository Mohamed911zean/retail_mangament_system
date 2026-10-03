import { execute, mapRows, type DatabaseHandle } from './common'
export function listSaleReturns(database: DatabaseHandle, customerId?: string): Record<string, unknown>[] {
  const rows = customerId === undefined
    ? execute(() => database.prepare('SELECT * FROM sale_returns ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM sale_returns WHERE customer_id = ? ORDER BY created_at,id').all(customerId))
  return mapRows(rows as Record<string, unknown>[])
}
export function insertSaleReturn(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sale_returns (id,return_number,original_sale_id,customer_id,user_id,shift_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,created_at,updated_at,device_id) VALUES (@id,@return_number,@original_sale_id,@customer_id,@user_id,@shift_id,@total_piasters,@cash_refunded_piasters,@credited_to_account_piasters,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listSaleReturnItems(database: DatabaseHandle, saleReturnId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sale_return_items WHERE sale_return_id = ? ORDER BY id').all(saleReturnId)) as Record<string, unknown>[])
}
