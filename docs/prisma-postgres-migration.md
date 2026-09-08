# MySQL to Prisma Postgres

**Optional historical transfer guide.** The owner subsequently chose a fresh
PostgreSQL database. Do not run this import as part of normal setup. Follow
[fresh PostgreSQL setup](fresh-postgres-setup.md) instead. Existing MySQL data
and transfer tooling are preserved, not automatically imported or deleted.

This branch changes the database engine from MySQL to PostgreSQL while retaining Prisma ORM 5. It does not upgrade to a different Prisma major, delete MySQL records, or automatically copy production data during build/startup.

## Changes and rationale

- PostgreSQL datasource and an initial PostgreSQL migration: changing a URL alone cannot change the SQL dialect or native column types.
- Request-letter `LongBlob` becomes PostgreSQL `ByteA`; bytes are preserved by the transfer tool.
- Raw row-lock queries quote mixed-case table and column names, as PostgreSQL requires.
- Directory/activity searches and email login explicitly use case-insensitive matching. Additional lowercased-email unique indexes preserve case-insensitive account/member uniqueness; these expression indexes are maintained in SQL migrations, not modeled by Prisma schema fields.
- Docker uses a new PostgreSQL volume. The old MySQL volume is not removed. No startup script runs the old tag cleanup or automatic `db push`.
- CI provisions disposable PostgreSQL for concurrency tests and separate MySQL/PostgreSQL services for an end-to-end transfer check.

## Before touching the hosted database

1. Revoke the database credential shared in chat and generate a replacement. Never put URLs containing passwords in commits, screenshots, CLI arguments, or chat.
2. Back up MySQL and both `private/uploads/pmac` and legacy `public/uploads/pmac`; verify that the backup is restorable. Keep the original MySQL database available for rollback.
3. Choose a **new, empty** Prisma Postgres destination. Production and Preview must have separate databases and credentials. This guide does not authorize overwriting an existing destination.
4. Arrange a maintenance window: stop all application writes to MySQL and keep them stopped through verification/cutover. A snapshot alone does not capture later writes.

## Connections

Store these privately in the migration operator's environment. The scripts load `.env.local`/`.env` but do not write them. Explicit process environment variables take precedence.

| Variable | Purpose |
| --- | --- |
| `MYSQL_SOURCE_URL` | Existing MySQL database; preferably a SELECT-only account |
| `DATABASE_URL` | PostgreSQL runtime connection; use Prisma Postgres's pooled URL on Vercel |
| `DIRECT_URL` | PostgreSQL direct connection for Prisma schema migrations |
| `POSTGRES_TARGET_URL` | Same destination database as above, using the direct connection for data transfer |

Use the pooled/direct values supplied by the Prisma Console, not a manually reconstructed password. Hosted PostgreSQL URLs must include `sslmode=require` or stronger. See [Prisma's pooling guidance](https://www.prisma.io/docs/postgres/database/connection-pooling). Do not put MySQL URLs into the new application's datasource.

## Prepare, verify, then copy

Run these from this branch in a separate working copy while the old app retains its MySQL client:

```powershell
npm ci
npm run db:migration-source-client
# Inspect the destination independently: this initial migration is for an empty database.
npm run db:migrate
# Default behavior reads the source and verifies the destination is empty; no row writes.
npm run db:import-mysql
```

Only after backup, a successful dry run, and stopping source writes:

```powershell
$env:MYSQL_MIGRATION_APPLY = '1'
$env:MIGRATION_SOURCE_FROZEN = '1'
try { npm run db:import-mysql } finally {
  Remove-Item Env:MYSQL_MIGRATION_APPLY
  Remove-Item Env:MIGRATION_SOURCE_FROZEN
}
```

The tool copies all 18 current application models in dependency order, retaining IDs, account password hashes, roles, dates, votes, attendance, receipts, attachment metadata, audit JSON, and embedded request-letter bytes. A repeatable-read source snapshot and a single serializable destination transaction are used. Row-content checksums and SQL-NULL versus JSON-null checks must match before commit. A nonempty destination is rejected rather than overwritten. A failed database write/verification rolls back the destination transaction; a lost connection at commit can make the outcome uncertain, so inspect the destination before retrying. No source row is updated or deleted.

Limits: 10,000 rows per model, 256 MB serialized snapshot, and two-minute transactions. Larger databases need a reviewed streaming transfer. This tool copies models present in the frozen application schema, not unused historical MySQL tables. It does not create a backup or copy file-based PMAC attachments. Do not seed the destination: importing accounts retains their existing passwords.

## Cutover and acceptance

1. Copy file-based attachments to the chosen durable private storage and verify checksums. The database import preserves their existing paths but does not make local files available on Vercel.
2. Verify record counts/checksums and sign in with an existing account against a protected test deployment. Test role access, attendance, notifications, votes, project closure, and authorized/unauthorized downloads.
3. Configure new Vercel deployments with PostgreSQL URLs and the existing `NEXTAUTH_SECRET`, then redeploy the reviewed branch. Old deployments do not inherit changed environment variables. Do not point a MySQL-version deployment at PostgreSQL.
4. After acceptance, switch traffic. Keep the MySQL backup and original uploads. If rollback is necessary after PostgreSQL has accepted new writes, reconcile those writes first; simply switching the URL back can lose them.

No hosted transfer is planned for the fresh-database rollout. Running a later
transfer requires a separate explicit decision and the safeguards above.
