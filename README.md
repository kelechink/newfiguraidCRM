# Figuraid OS v2

Internal operating system for Figuraid Ltd: CRM, unified inbox, telecom wholesale billing, finance,
HR and payroll, attendance, tasks and more, for Figure Academy, FigureWeb, Telecom and Figuraid HQ.

- Architecture, data model and security plan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Built so far: login (password + lockout, server-side sessions), server-side permissions,
  app shell (sidebar, unit switcher, light/dark), **Tasks board** and **SOP templates**.

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL and NEXTAUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate              # applies all migrations
npm run db:seed                 # demo data (refuses to run in production)
npm run dev                     # http://localhost:3000
```

Demo accounts (password printed by the seed, `Figuraid-demo-2026!` by default):

| Who | Email | Sees |
|---|---|---|
| Founder (Super Admin) | kelechi@figuraid.com | Every task and SOP; tasks they create are tagged **Founder** |
| Operations Manager | amaka@figuraid.com | Everything; creates **Team lead** tasks |
| FigureWeb lead | tunde@figuraid.com | FigureWeb tasks and SOPs only |
| Academy lead / Telecom lead | ngozi@ / ibrahim@figuraid.com | Their unit only |
| Staff | chidi@figuraid.com | Only their own tasks; reads their unit's SOPs |

## Tests

```bash
npm run typecheck
npm test                        # unit + integration (needs Postgres; uses TEST_DATABASE_URL,
                                # default postgresql://figuraid:figuraid@localhost:5432/figuraid_it)
```

## Tasks and SOPs: how it works

- **Three origins**, set by the server, never by the client: tasks created by the Super Admin
  are **Founder**, by anyone else allowed to assign work are **Team lead**, and tasks made from
  a schedule are **SOP**. The board filters by origin.
- **Board**: To do, In progress, Blocked, Done. Drag with the mouse, a finger (press and hold)
  or the keyboard (focus a card, Space, arrow keys, Space). Order is saved with fractional ranks,
  so each move updates one row.
- **SOP templates**: steps plus a schedule (every working day, chosen weekdays, or a day of the
  month; public holidays skipped) and assignees. **Generate due tasks** creates one task per
  assignee for each SOP's latest due occurrence in the last 7 days, with the steps as a checklist.
  It's idempotent: pressing twice, or two leads pressing at once, never duplicates work.
- **Access**: staff see and move only their own tasks; unit leads manage their unit;
  Ops Manager and Super Admin see all units. Enforced in `src/server/modules/*` on every query.
