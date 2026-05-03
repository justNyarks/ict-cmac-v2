# ICT CMAC — Documentation Service Request System

A Next.js 14 web application for managing documentation service requests (CMAC/PMAC) across school units.

---

## 🏫 Schools Covered
- SNAHS
- SBAHM
- SITE
- SASTE
- School of Medicine
- BEU

## 👥 Roles
| Role | Description |
|------|-------------|
| **Secretary** | Submits service requests with a request letter |
| **CMAC Coordinator** | First-level approver |
| **ICT Director** | Final approver |

## 📋 Services
- **CMAC** — Photo / Video / Both documentation
- **PMAC** — Photo / Video / Both documentation

## 🔄 Approval Flow
```
Secretary → submits request + letter
     ↓
CMAC Coordinator → reviews & approves/rejects
     ↓
ICT Director → final approval/rejection
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/justNyarks/ict-cmac.git
cd ict-cmac

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production
```bash
npm run build
npm start
```

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx            # Dashboard
│   ├── requests/           # Request list with approval actions
│   ├── new-request/        # Multi-step request form (Secretary)
│   ├── calendar/           # Event calendar view
│   ├── analytics/          # Analytics & charts
│   └── admin/              # User management
├── components/
│   └── layout/
│       ├── Sidebar.tsx
│       └── TopBar.tsx
├── lib/
│   └── data.ts             # Mock data & helpers
└── types/
    └── index.ts            # TypeScript types
```

---

## 🗺️ Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with KPIs and recent requests |
| `/requests` | Full request list with filter & approval modal |
| `/new-request` | 4-step form to submit a new request |
| `/calendar` | Monthly calendar of scheduled events |
| `/analytics` | Charts: by school, service, status, month |
| `/admin` | User management: add/remove users by role |

---

## 🛠️ Tech Stack
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** (icons)

---

## 📌 Next Steps (TODO)
- [ ] Connect to a real database (PostgreSQL / Supabase)
- [ ] Implement NextAuth.js for role-based authentication
- [ ] File upload integration (Cloudinary or S3) for request letters
- [ ] Email notifications on approval/rejection
- [ ] Push notifications for pending requests
