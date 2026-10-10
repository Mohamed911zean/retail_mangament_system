import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'
import { runOperation, type OperationContext } from './operations'

/**
 * The only file in the IPC layer that touches Electron. Every channel resolves
 * to an `IpcResult`, so the renderer gets a stable Arabic error instead of a
 * rejected promise whose custom properties would not survive serialization.
 */
export function registerIpcHandlers(context: OperationContext): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, payload: unknown) => runOperation(channel, payload, context))
  }
}
