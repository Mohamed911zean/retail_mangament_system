import { execute, type DatabaseHandle } from './common'
export function nextSequenceNumber(database: DatabaseHandle, deviceId: string, sequenceName: 'sale_invoice' | 'purchase' | 'sale_return', now: number): number {
  return execute(() => {
    database.prepare(`
      INSERT INTO device_sequences (device_id,sequence_name,next_value,updated_at)
      VALUES (?, ?, 2, ?)
      ON CONFLICT(device_id,sequence_name) DO UPDATE SET next_value = next_value + 1, updated_at = excluded.updated_at
    `).run(deviceId, sequenceName, now)
    const row = database.prepare('SELECT next_value FROM device_sequences WHERE device_id = ? AND sequence_name = ?').get(deviceId, sequenceName) as { next_value: number }
    return row.next_value - 1
  })
}
