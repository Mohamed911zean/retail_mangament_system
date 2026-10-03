# Repositories

Repositories are the only SQL boundary. They use prepared statements with
bound parameters and receive a `DatabaseHandle`, which can be the live
database or the handle passed to a service transaction. They do not open or
commit transactions.

`runInTransaction(database, work)` wraps a callback in one SQLite transaction.
Any thrown error rolls back every write. `nextSequenceNumber` updates
`device_sequences` atomically and never reuses a number.

## Repository modules

| Module | Main operations |
|---|---|
| settings | insert, get, list |
| users | insert, get, list |
| catalog | product/category reads and product, unit, barcode access |
| customers | insert, get, list |
| suppliers | insert, get, list |
| stock | movement insert/list, batch-ready stock access, `getOnHand` |
| sales | sale insert/get/list and item listing |
| money-ledger | ledger insert and shift/all listing |
| shifts | shift insert/list and `getOpenShift` |
| held-sales | held-cart insert/list |
| audit-log | audit insert and filtered listing |
| sequences | atomic `nextSequenceNumber` |
| purchases | purchase insert/list and item listing |
| sale-returns | return insert/list and item listing |
| stock-counts | count insert/list and item listing |
| expenses | expense insert/list |

The mapper converts `snake_case` keys to camelCase, preserves nulls, and
converts schema booleans (`is_active`, `is_primary`, `track_expiry`, and
`is_weighted`) from SQLite 0/1 to TypeScript booleans.

Constraint failures become `RepositoryError` values with
`constraint_unique`, `constraint_check`, or `constraint_foreign_key` codes.
Unexpected SQLite failures become `database_error`; raw SQLite text is kept as
the cause, not exposed as the user-facing message.

