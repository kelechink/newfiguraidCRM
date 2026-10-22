# Figuraid OS v2

Internal operating system for Figuraid Ltd: CRM, unified inbox, telecom wholesale billing, finance,
HR and payroll, attendance, tasks and more, for Figure Academy, FigureWeb, Telecom and Figuraid HQ.

**Status:** Step 1 (architecture and data model) is awaiting approval. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local setup (so far)

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npx prisma validate
npx prisma migrate dev        # applies init + integrity_guards
```

The schema is split per module in `prisma/schema/*.prisma`.
