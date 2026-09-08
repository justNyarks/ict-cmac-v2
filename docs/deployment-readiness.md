# Deployment readiness

**Current direction:** fresh Prisma Postgres, without importing MySQL records.
PRs #15 and #16 are merged. Use [fresh PostgreSQL setup](fresh-postgres-setup.md)
and [the current review checklist](system-review-cleanup.md).
The dated checklist below is historical and does not describe current deployment status.

## Checklist (7 September 2026)

| Task | Current result | Remaining acceptance |
| --- | --- | --- |
| Diagnose Vercel | Build log confirms Prisma `P1012`: missing `DATABASE_URL` during automatic `db push`. Removed schema mutation from the build command. | Check the new preview build. Configure a hosted MySQL database before expecting the application to work. |
| Persistent uploads | Existing Docker upload volume remains available; Vercel storage selection requested from owner. | Choose private object storage or persistent Docker hosting, configure it, migrate legacy files, and verify downloads after redeployment. |
| Browser acceptance | Browser integration still reports no connected browser. | Signed-in role, notification, attendance, attachment, and project closure checks. |
| Concurrency | Local MySQL checks pass for competing responses, duplicate votes, poll closure, vote-versus-close, event completion, project closure, and milestone-edit-versus-closure. Temporary fixtures removed. | GitHub's new isolated MySQL job must pass. These are production database helper checks, not full authenticated HTTP/session tests or exhaustive races across every workflow. |
| Deployment safeguards | Builds no longer change schemas or seed data. Legacy download authorization regression tests pass. | Verify hosted database separation, backup/restore, deployed legacy-file protection and storage persistence. |
| PR #15 | Changes remain on the review branch. | Do not merge while required deployment setup and acceptance checks are unresolved. |

## Confirmed deployment cause

The [failed preview](https://vercel.com/jnmarkfriedrich-1564s-projects/ict-cmac-v2/3TnbbESB8RzitBAExCLRXDDRond5) at `f6a54d2` stopped before Next.js compilation:

> Error code: P1012 — Environment variable not found: DATABASE_URL.

Read-only environment listings show only `NEXTAUTH_SECRET` configured for both Preview and Production. No hosted database URL, explicit auth URL, or ClamAV endpoint is configured there. The project currently selects Node 24; local verification and GitHub checks use Node 22.

The old build command coupled application compilation to live database changes. It has been replaced with `npm run build`, with a regression check to prevent automatic schema pushes or seeds from returning. This removes the failing schema-push step; **a successful build does not mean the application can run without a database**.

## Configuration required from the owner

1. Choose hosted MySQL or persistent Docker hosting. For Vercel, configure distinct Preview and Production databases and credentials in the dashboard. Never use a localhost URL on Vercel or give Preview production credentials. Environment values were not downloaded, copied, or exposed during this review.
2. Apply reviewed schema changes separately, after backup, with deployment credentials. Do not add `--accept-data-loss` to make a deployment pass. Runtime credentials should not have schema-administration permissions.
3. Configure the correct auth URL/origins and a reachable private or TLS-protected ClamAV endpoint. Upload scanning must remain fail-closed.
4. Choose the attachment storage backend. Private Vercel Blob is an option, but no store has been provisioned and no billable service or token has been added. Vercel's [server upload documentation](https://vercel.com/docs/vercel-blob/server-upload) limits server uploads to 4.5 MB; the current PMAC UI allows 5 MB. The selected solution must account for this discrepancy without bypassing malware scanning or exposing unscanned files.
5. Connect the browser and sign in to a test account for the manual acceptance checklist in `workflow-hardening-review.md`.

## Backup and legacy-file acceptance

- Back up MySQL and all attachment objects together; database metadata alone cannot restore locally stored PMAC files. Request letters stored in MySQL are part of the database backup.
- Use an encrypted backup location with access controls and retention. Verify restoration into a separate, newly provisioned database and storage target—not over the live app.
- Compare restored record counts and attachment checksums, then test authorized downloads and rejected unrelated-member/anonymous downloads.
- Preserve legacy files until migration and restore are verified. Legacy `/uploads/pmac/...` requests must continue through the authenticated Next.js route, not an independently served public bucket or static CDN path.
- These are acceptance requirements, not completed production checks: no hosted database, production backup location or restore target has been supplied.

## Concurrency changes and short review

- **Polls:** an outside-transaction open-state check allowed a delayed vote to outlive closure. Voting now locks and rechecks the poll before inserting. Closure uses a conditional update; stale draft edits/opening cannot overwrite later states.
- **Events:** completion readiness was read before the transaction. It is now reread under the event row lock before a conditional completion write. Competing completion requests yield one success.
- **Projects:** final output and status closure could both use stale head/readiness data and write completion twice. Both paths now share a locked closure helper that rereads the head, director check and milestones. Project child edits acquire the same parent lock and reject completed projects. Ordinary project editing cannot close or reopen a completed project; deadline reconciliation no longer overwrites a concurrently completed status.
- **CI:** dependency audit alone did not exercise application behavior. The new Application Checks workflow runs unit/regression tests, lint, typecheck, production build, and a separate disposable MySQL concurrency job. Only that throwaway service is schema-provisioned automatically.

Local verification: 176 tests pass, plus the real-MySQL checks above. Full lint/type/build results and the latest remote checks are reported with the PR; no browser or production restore completion is claimed.
