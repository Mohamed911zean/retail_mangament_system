# Database migrations

Migrations are forward-only numbered SQL files under `migrations/`. The
filename is the migration id (`0003_phase1a_core`, for example), and files are
applied in numeric order. Applied files are never edited: the runner stores a
SHA-256 checksum in `schema_migrations` and rejects a changed file with
`migration_checksum_mismatch:<id>`.

The runner creates an online pre-migration backup with `better-sqlite3.backup()`
before applying pending migrations to an existing database. Each migration and
its metadata insert run in one SQLite transaction. A failed migration rolls
back the transaction; the pre-migration backup remains available under
`<userData>/backups/`.

## Adding a migration

1. Add the next numeric `.sql` file.
2. Keep all identifiers in `snake_case`, tables `STRICT`, timestamps as UTC
   epoch milliseconds, and money/quantities as INTEGER.
3. Put parent tables before child tables when adding foreign keys.
4. Add only schema-required indexes and document any additional index in
   `docs/DECISIONS.md`.
5. Test a fresh database, an upgrade copy, `foreign_key_check`, and
   `integrity_check`.
6. Never edit an applied migration; add a new forward migration instead.

Core migrations run before client migrations. A client migration must use a
reserved client prefix and must not alter core tables in a way that breaks the
frozen schema or core services.

## SQLite table rebuild

SQLite does not support every `ALTER TABLE` operation. For a constrained
change, use this sequence in a migration:

1. Create the replacement table with the complete desired definition.
2. Copy compatible columns from the old table.
3. Drop the old table only after the copy succeeds.
4. Rename the replacement table to the original name.
5. Recreate documented indexes and triggers.
6. Run foreign-key and integrity checks in tests.

`PRAGMA foreign_keys` cannot be changed inside a transaction. It must be set
on the connection before the migration transaction starts; migrations must
not rely on toggling it inside their own transaction.

## Reset and verification scripts

`npm run db:migrate` applies pending migrations, `npm run db:status` reports
applied checksums and pending files, and `npm run db:verify` checks ledgers,
invariants, reversals, triggers, sales, shifts, foreign keys, and SQLite
integrity. `npm run db:reset` is development-only and refuses every path
except the explicit `.dev-data/dev.db` location.

