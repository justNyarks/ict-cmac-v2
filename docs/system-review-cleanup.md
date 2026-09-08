# CMAC / PMAC review fixes

Review branch: `codex/system-review-cleanup`. No production deployment or database
mutation is implied by this checklist.

## Implemented

| Change | Why the gap existed | Verification |
| --- | --- | --- |
| Enforce temporary-password replacement | The flag was only shown as a banner. Shared reads and mutations now refuse normal access; protected pages redirect to Profile. Password replacement rejects reusing the temporary password. | Access and profile action regression tests. |
| Consolidate poll navigation and screens | Coordinator oversight duplicated the existing permission-aware poll list/workspace and fetched details through two effects. The legacy URL redirects to the canonical list; the duplicate component is removed. Loading has error/retry handling. | Shared navigation tests, route/type/build checks; browser acceptance still required. |
| Share sidebar and dashboard navigation | Independently maintained role lists omitted Projects from the member sidebar. Both now use one policy. Active navigation matches only the most specific path segment. Project cards retain their record ID. | Navigation tests and dashboard query regression checks. |
| Correct dashboard workload/voting rules | Counting zero assignments missed incomplete coverage. Pending responses ignored event state; open-poll counts ignored dates. Dashboard uses confirmed coverage and current approved events, and both poll counts/lists respect opening/closing time. | Coverage/voting-window tests. |
| Make PMAC attachments persistent | File writes assumed persistent local hosting. Owner selected PostgreSQL for small files. An additive content table keeps bytes out of metadata queries; upload writes metadata/content atomically after scanning, and downloads authorize the parent before loading bytes. | Upload/download tests; PostgreSQL CI byte round-trip and cascade check. |
| Match deployed upload limits | The previous 5 MB allowance exceeded Vercel's 4.5 MB request limit. Both upload types now allow 4 MB, including client-side rejection before transmission. | Upload boundary tests. |
| Block unisolated Preview database access | Database variables were shared between Preview and Production. Every Prisma query in Preview is blocked until the operator explicitly configures isolation. This includes reads, because some read actions reconcile statuses. | Deployment policy tests. |
| Remove obsolete schema fallbacks | Old generated-client compatibility branches returned empty reports or omitted password requirements. The supported schema is required; generation checks fail clearly rather than substituting fake empty data. | Full unit/type/build suite. |
| Clarify agreement polls | Schedule Preference suggested multiple selectable dates, but polls have fixed Yes/No/Abstain answers. Display label is now Schedule Agreement, with explanatory form text. Stored enum values and existing votes are unchanged. | Existing poll tests/type checks. |
| Update deployment guidance | Documentation still claimed data import and unmerged PRs. Fresh PostgreSQL onboarding is now the primary guide; historical transfer tooling is explicitly optional. The old destructive tag-cleanup SQL is archived. | Documentation review. |

## External setup still required

Local verification: **201 tests pass**, ESLint and TypeScript checks pass, and
the production build succeeds. Docker is not installed in this environment;
the disposable PostgreSQL migration/storage/concurrency checks run in GitHub CI.
No signed-in browser acceptance, live migration, or scanner provisioning was
performed for this branch.

1. Provision a **separate Preview database**. Split Vercel database variables by
   environment; do not merely set an isolation flag against the production URL.
   Only then set `PREVIEW_DATABASE_ISOLATED=true` for Preview. This flag is operator
   confirmation, not an automatic comparison of remote database identities.
2. Store `DATABASE_URL`, `DIRECT_URL`, and `NEXTAUTH_SECRET` as Secret-type variables.
   Use separate authentication secrets for Preview and Production. Ordinary URLs
   and allowed origins may remain Config variables. Rotate any exposed credentials.
3. Configure a reachable malware scanner (`CLAMAV_HOST`, port and TLS settings).
   No scanner was supplied or provisioned. Uploads remain intentionally blocked
   while scanning is unavailable; do not disable scanning to enable uploads.
4. Back up production, then apply `npm run db:migrate` using the reviewed branch
   and the intended direct database URL **before deploying this branch**. The new
   migration only creates `PmacAttachmentContent` and its foreign key.
5. Test small-file upload/download after redeployment, missing scanner, unrelated
   user access, forced password changes, member projects navigation, coordinator
   polls, and dashboard counts using real signed-in accounts.

## Preserved deliberately

- Requests and PMAC events remain distinct linked workflow records.
- Assignments and attendance remain distinct; audit records remain available.
- Existing MySQL records and legacy attachment files are untouched. PostgreSQL
  storage applies to new uploads, not an automatic legacy-file import.
- The optional MySQL transfer scripts and their CI checks remain available for
  rollback/history. `courseOrDepartment` remains a legacy data field until all
  relevant historical records have been reviewed; removing it requires a separate
  data migration, not a blind schema drop.
- Do not seed production with demo users.
