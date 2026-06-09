# ICT CMAC - Documentation Service Request System

A Next.js App Router application for managing CMAC and PMAC documentation requests across school units.

## Highlights

- Role-based access for `SECRETARY`, `CMAC_COORDINATOR`, and `ICT_DIRECTOR`
- Multi-step request submission flow
- Coordinator and director approval workflow
- Shared event calendar with conflict detection
- Dashboard and notifications for request activity
- Prisma + PostgreSQL persistence
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

- Node.js 18+
- npm
- PostgreSQL database

### Install

```bash
npm install
```

### Environment

Create a `.env` file with at least:

```bash
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="replace-me"
```

### Database

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
