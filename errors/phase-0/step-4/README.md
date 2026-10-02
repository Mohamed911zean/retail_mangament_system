# Step 4 Error Record

## Silent virtual-printer verification timeout

- Command path: `window.api.printTestReceipt('Microsoft Print to PDF')` through the Electron CDP session.
- Observed behavior: the local receipt HTML was generated, but the CDP evaluation did not return before the connection timed out.
- Main-process log: no new error was written to `%APPDATA%\small_erp\logs\main.log`.
- Interpretation: printer enumeration and receipt generation work; silent Windows-driver completion was not independently verifiable here.
- Required follow-up: verify the test receipt on a real thermal printer and A4/virtual printer on the target Windows 10 machine.
