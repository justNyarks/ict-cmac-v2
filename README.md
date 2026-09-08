# ICT CMAC - Documentation Service Request System

A Next.js App Router application for managing CMAC and PMAC documentation requests across school units.

For the active Vercel deployment, use [fresh PostgreSQL setup](docs/fresh-postgres-setup.md).
The owner chose a new database, not an import of MySQL records.
See [the latest fixes and remaining setup](docs/system-review-cleanup.md).

## Highlights

- Role-based access for `SECRETARY`, `CMAC_COORDINATOR`, and `ICT_DIRECTOR`
- Multi-step request submission flow
- Coordinator and director approval workflow
- Shared event calendar with conflict detection
- Dashboard and notifications for request activity
- Prisma ORM + PostgreSQL persistence (Prisma Postgres compatible)
- NextAuth credential-based authentication

## Tech Stack

- Next.js 16
- React 18
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- NextAuth

## Getting Started

### Prerequisites

- Node.js 22 (matches CI and Docker; Next.js requires at least 20.9)
- npm
- PostgreSQL database (hosted Prisma Postgres or local PostgreSQL)
- ClamAV scanner for file uploads

### Install

```bash
npm install
```

### Environment

Create a `.env` file with at least:

```bash
DATABASE_URL="postgresql://postgres:local-development-only@127.0.0.1:5432/ict_cmac"
DIRECT_URL="postgresql://postgres:local-development-only@127.0.0.1:5432/ict_cmac"
NEXTAUTH_SECRET="replace-me"
NEXTAUTH_URL="http://localhost:3000"
SERVER_ACTION_ALLOWED_ORIGINS="localhost:3000,127.0.0.1:3000"
CLAMAV_HOST="127.0.0.1"
CLAMAV_PORT="3310"
CLAMAV_TIMEOUT_MS="30000"
```

For Prisma Postgres, use its pooled URL as `DATABASE_URL` and its direct URL as `DIRECT_URL`, with TLS enabled. Copy values privately from the Prisma Console; do not commit credentials. Existing MySQL installations must follow the [data-preserving migration guide](docs/prisma-postgres-migration.md) before changing their application connection.

### Database

If you do not already have PostgreSQL and ClamAV running locally, start the bundled containers first:

```bash
docker compose up -d db clamav
```

```bash
npx prisma generate
npm run db:migrate
```

Optional seed for a fresh development database only (do not seed a migrated database):

```bash
npx prisma db seed
```

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### PMAC file storage and workflow review

New PMAC uploads are scanned and stored in PostgreSQL, with a 4 MB file limit.
Apply the reviewed attachment-content migration before deploying this version.
Back up the database and verify restoration. Legacy `private/uploads/pmac` files
still require their original disk/volume backup; they are not automatically imported.
Upload files remain excluded from Git and Docker build context.

Existing `/uploads/pmac/...` links are handled by the Next.js proxy and an authenticated, record-scoped download route; historical files are not moved or deleted. Do not configure a reverse proxy/CDN to serve that directory directly, bypassing Next.js. Preserve existing `public/uploads/pmac` files when deploying an upgrade, and include them in backups until migrated separately.

See [the implementation checklist and review](docs/workflow-hardening-review.md) for the changes, causes, tests, and manual acceptance checks.

## Available Scripts

- `npm run dev` - start the dev server
- `npm run build` - create a production build
- `npm run start` - run the production build
- `npm run lint` - run ESLint

## Docker

Build and run the app container:

```bash
docker compose up --build
```

The container expects these environment variables:

```bash
DATABASE_URL="postgresql://postgres:local-development-only@db:5432/ict_cmac"
DIRECT_URL="postgresql://postgres:local-development-only@db:5432/ict_cmac"
NEXTAUTH_SECRET="replace-me"
NEXTAUTH_URL="http://localhost:3000"
SERVER_ACTION_ALLOWED_ORIGINS="localhost:3000,127.0.0.1:3000"
```

Optional container startup flags:

```bash
PRISMA_RUN_MIGRATIONS=0
PRISMA_RUN_SEED=0
```

By default `docker compose` starts a local PostgreSQL service named `db`, and the app container points Prisma at that service automatically. Its new volume does not reuse or delete the old MySQL data volume. The example database password is for local development only; keep production databases private and use strong credentials.
It also starts the official ClamAV service and waits for its virus definitions and daemon health check before starting the app. Uploads fail closed when ClamAV is missing, unavailable, times out, or returns an invalid response; rejected files are never persisted.
Schema changes are opt-in: run `docker compose run --rm app npm run db:migrate` before first startup, or explicitly set `PRISMA_RUN_MIGRATIONS=1` for a controlled deployment. Startup no longer runs the old MySQL tag-deletion script or `db push`.
The container keeps the same runtime contract as the non-Docker app: `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` must be provided. `docker compose` loads them from `.env`, and the entrypoint fails fast if any required value is missing.

After deploying the CMAC-to-PMAC fulfillment workflow for the first time, reconcile existing approved PMAC requests once:

```bash
npm run backfill:pmac-handoffs
```

Vercel's build command only generates Prisma Client and builds Next.js. It deliberately does **not** push the schema or seed a database. Apply reviewed schema migrations separately after taking a backup. Configure PostgreSQL `DATABASE_URL` and `DIRECT_URL`; Preview must use a separate database and credentials from Production. A successful build alone does not verify database connectivity. See the [migration guide](docs/prisma-postgres-migration.md) and [deployment readiness](docs/deployment-readiness.md).

### Malware scanner deployment

The upload routes use ClamAV's `INSTREAM` protocol. Configure `CLAMAV_HOST`, with optional `CLAMAV_PORT` and `CLAMAV_TIMEOUT_MS`, in every environment that accepts uploads. For a scanner behind a TLS proxy, set `CLAMAV_TLS=true` and optionally `CLAMAV_SERVER_NAME` for certificate verification.

Raw ClamAV TCP traffic is unauthenticated and unencrypted. Keep port `3310` on a private network; the bundled Docker configuration exposes it only on `127.0.0.1`. Serverless deployments such as Vercel need a private or TLS-protected scanner endpoint and must never expose `clamd` directly to the public internet.

## Main Routes

- `/` - dashboard
- `/requests` - request list and approval actions
- `/new-request` - request submission flow
- `/calendar` - event calendar
- `/analytics` - coordinator/director analytics
- `/logs` - coordinator audit log view
- `/admin` - director user management
- `/profile` - profile and password updates

## Notes

- Secretaries can submit requests and follow their own request progress.
- Coordinators handle first-level review.
- Directors can finalize approvals and create direct calendar entries.
- Calendar conflict checks run both in the UI and on the server before creation.
