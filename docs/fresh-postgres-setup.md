# Fresh PostgreSQL deployment

The owner chose a fresh Prisma Postgres database, not a MySQL record import.
PRs #15 and #16 were merged into main. Old deployment attempts can still show
MySQL errors; select the deployment for the current source commit.

## Production

1. Use the PostgreSQL-compatible source and the repository build command:
   `npm run build`. Builds must not push schemas, import records, or seed users.
2. In Vercel Production, configure:
   - `DATABASE_URL`: the pooled PostgreSQL connection string (Secret).
   - `DIRECT_URL`: the direct connection for the same database (Secret).
   - `NEXTAUTH_SECRET`: a securely generated authentication secret (Secret).
   - `NEXTAUTH_URL`: the canonical production HTTPS origin (Config).
   - Scanner settings: `CLAMAV_HOST`, optional `CLAMAV_PORT`,
     `CLAMAV_TLS=true` and `CLAMAV_SERVER_NAME` for a TLS-protected endpoint.
3. Back up before schema changes. Run `npm run db:migrate` separately with the
   intended direct URL. Never use reset or accept-data-loss on production.
4. Deploy the reviewed new commit. Redeploying an old deployment reuses its old
   source; changing environment settings does not change its database provider.
5. Create the initial real administrator through a controlled operator process.
   Do not use the demo seed as production onboarding.

## Preview

Provision a different database and credentials. Scope them to Preview only,
and give Preview a separate authentication secret. After checking isolation,
set `PREVIEW_DATABASE_ISOLATED=true` in Preview.

Without that explicit confirmation the review branch refuses all Preview
database queries. Production remains unaffected. Setting the flag without
actually separating databases defeats the safeguard.

## Attachments

New PMAC attachments are stored in PostgreSQL after malware scanning. Bytes live
in `PmacAttachmentContent`, separate from list metadata, with cascade deletion.
Request letters already use database-backed storage. The file limit is 4 MB.
Back up the database, monitor its storage quota, and test restoration.

Historical disk-backed attachments are not automatically imported. Keep and
back up their original files; deployment to Vercel does not transfer those files.
Do not remove the authenticated legacy-download handling until migration and
access tests have passed.

An absent or unreachable scanner intentionally blocks uploads with an error.
Scanner configuration and live acceptance remain deployment requirements.
