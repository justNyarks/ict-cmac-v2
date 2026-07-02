# ICT CMAC - Documentation Service Request System

A Next.js App Router application for managing CMAC and PMAC documentation requests across school units.

## Highlights

- Role-based access for `SECRETARY`, `CMAC_COORDINATOR`, and `ICT_DIRECTOR`
- Multi-step request submission flow
- Coordinator and director approval workflow
- Shared event calendar with conflict detection
- Dashboard and notifications for request activity
- Prisma + MySQL persistence
- NextAuth credential-based authentication

## Tech Stack

- Next.js 16
- React 18
- TypeScript
- Tailwind CSS
- Prisma
- MySQL
- NextAuth

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- MySQL database

### Install

```bash
npm install
```

### Environment

Create a `.env` file with at least:

```bash
DATABASE_URL="mysql://root@127.0.0.1:3306/ict_cmac"
NEXTAUTH_SECRET="replace-me"
NEXTAUTH_URL="http://localhost:3000"
SERVER_ACTION_ALLOWED_ORIGINS="localhost:3000,127.0.0.1:3000"
```

If you are using XAMPP's default local MySQL, `root` usually has no password, which matches the example above.

### Database

If you do not already have MySQL running locally, start the bundled container first:

```bash
docker compose up -d db
```

```bash
npx prisma generate
npx prisma db push
```

Optional seed:

```bash
npx prisma db seed
```

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

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
DATABASE_URL="mysql://root:root@127.0.0.1:3306/ict_cmac"
NEXTAUTH_SECRET="replace-me"
NEXTAUTH_URL="http://localhost:3000"
SERVER_ACTION_ALLOWED_ORIGINS="localhost:3000,127.0.0.1:3000"
```

Optional container startup flags:

```bash
PRISMA_SKIP_DB_PUSH=0
PRISMA_RUN_SEED=0
```

By default `docker compose` starts a local MySQL service named `db`, and the app container points Prisma at that service automatically.
The container also runs `prisma db push` before starting Next.js so the schema stays in sync with the configured database.
The container keeps the same runtime contract as the non-Docker app: `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` must be provided. `docker compose` loads them from `.env`, and the entrypoint fails fast if any required value is missing.

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
