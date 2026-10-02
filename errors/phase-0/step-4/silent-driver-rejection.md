# Silent Driver Rejection

- Printer: `Microsoft Print to PDF`
- Operation: `window.api.printTestReceipt(...)`
- Observed error: Electron's `webContents.print` callback returned `success: false`.
- Generated template: `%APPDATA%\small_erp\print-cache\test-receipt.html`
- Main-process error path: now records the failure in `%APPDATA%\small_erp\logs\main.log` and rejects the typed IPC call.
- Status: physical thermal-printer and A4-driver verification is still required.
