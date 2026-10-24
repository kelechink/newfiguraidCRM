// Demo seed: realistic Figuraid units, people, SOPs and tasks so every screen can be shown.
// Run on an empty database: `npm run db:seed`. Refuses to run in production.
import { PrismaClient, type Priority, type TaskStatus, type UnitCode } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { initialRanks } from "../../src/domain/shared/rank";
import { addDays, localDate, occurrenceKey, zonedDateTime } from "../../src/domain/sop/schedule";
import { DEFAULT_ROLES, grantRows } from "../../src/server/authz/default-roles";

const db = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Figuraid-demo-2026!";

const UNITS: { code: UnitCode; name: string; accentColor: string }[] = [
  { code: "ACADEMY", name: "Figure Academy", accentColor: "#7c4ddb" },
  { code: "FIGUREWEB", name: "FigureWeb", accentColor: "#118ac2" },
  { code: "TELECOM", name: "Telecom", accentColor: "#ec7a0d" },
  { code: "HQ", name: "Figuraid HQ", accentColor: "#6e7a8a" },
];

const PEOPLE: { key: string; name: string; email: string; role: string; unit: UnitCode; extraUnits?: UnitCode[] }[] = [
  { key: "kelechi", name: "Kelechi Nkwocha", email: "kelechi@figuraid.com", role: "super_admin", unit: "HQ", extraUnits: ["ACADEMY", "FIGUREWEB", "TELECOM"] },
  { key: "amaka", name: "Amaka Okafor", email: "amaka@figuraid.com", role: "ops_manager", unit: "HQ", extraUnits: ["ACADEMY", "FIGUREWEB", "TELECOM"] },
  { key: "tunde", name: "Tunde Bakare", email: "tunde@figuraid.com", role: "unit_manager", unit: "FIGUREWEB" },
  { key: "ngozi", name: "Ngozi Eze", email: "ngozi@figuraid.com", role: "unit_manager", unit: "ACADEMY" },
  { key: "ibrahim", name: "Ibrahim Musa", email: "ibrahim@figuraid.com", role: "unit_manager", unit: "TELECOM" },
  { key: "chidi", name: "Chidi Okonkwo", email: "chidi@figuraid.com", role: "staff", unit: "FIGUREWEB" },
  { key: "fatima", name: "Fatima Bello", email: "fatima@figuraid.com", role: "staff", unit: "FIGUREWEB" },
  { key: "blessing", name: "Blessing Udo", email: "blessing@figuraid.com", role: "academy_coordinator", unit: "ACADEMY" },
  { key: "samuel", name: "Samuel Etim", email: "samuel@figuraid.com", role: "staff", unit: "ACADEMY" },
  { key: "emeka", name: "Emeka Nwosu", email: "emeka@figuraid.com", role: "telecom_ops", unit: "TELECOM" },
  { key: "aisha", name: "Aisha Lawal", email: "aisha@figuraid.com", role: "finance", unit: "HQ" },
];

type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";
const SOPS: {
  key: string;
  unit: UnitCode;
  owner: string;
  title: string;
  summary: string;
  frequency: Freq;
  weekdays?: number[];
  dayOfMonth?: number;
  dueTime: string;
  priority: Priority;
  assignees: string[];
  steps: [string, string?][];
  isActive?: boolean;
}[] = [
  {
    key: "renewals",
    unit: "FIGUREWEB",
    owner: "tunde",
    title: "Domain & hosting renewals check",
    summary: "No client should ever lose a domain or site because we forgot to remind them.",
    frequency: "WEEKLY",
    weekdays: [1, 4],
    dueTime: "11:00",
    priority: "HIGH",
    assignees: ["chidi", "fatima"],
    steps: [
      ["Pull every domain and hosting renewal due in the next 14 days from WHMCS"],
      ["Send the renewal reminder email to each client", "Use the 'Renewal — 14 days' saved reply"],
      ["WhatsApp anyone due within 3 days who hasn't paid"],
      ["Log each response on the contact's timeline"],
      ["Flag anything unpaid and due within 48 hours to Tunde"],
    ],
  },
  {
    key: "support-sweep",
    unit: "FIGUREWEB",
    owner: "tunde",
    title: "Morning support inbox sweep",
    summary: "Every FigureWeb message from overnight answered before 10am.",
    frequency: "DAILY",
    dueTime: "10:00",
    priority: "MEDIUM",
    assignees: ["chidi"],
    steps: [["Open the FigureWeb inbox and sort by oldest"], ["Reply or assign every unanswered conversation"], ["Create tickets for anything that needs technical work"]],
  },
  {
    key: "margin-review",
    unit: "TELECOM",
    owner: "ibrahim",
    title: "Weekly margin review per route",
    summary: "Telecom turnover is large but markup is thin — catch shrinking margins before they cost us.",
    frequency: "WEEKLY",
    weekdays: [1],
    dueTime: "12:00",
    priority: "HIGH",
    assignees: ["emeka"],
    steps: [
      ["Export last week's minutes per route, vendor and customer"],
      ["Compare sell rate against buy rate on every active route"],
      ["Flag any route under 2% margin, or negative", "Include the route, vendor, customer and minutes"],
      ["Review prepaid vendor balances against next week's expected traffic"],
      ["Send the summary to Ibrahim"],
    ],
  },
  {
    key: "prepaid-check",
    unit: "TELECOM",
    owner: "ibrahim",
    title: "Prepaid vendor balance check",
    summary: "Top up before a route drops — a dropped route loses the customer's traffic.",
    frequency: "DAILY",
    dueTime: "09:30",
    priority: "URGENT",
    assignees: ["emeka"],
    steps: [["Check each prepaid vendor's balance"], ["Compare with yesterday's usage"], ["Request a top-up from Finance for any vendor under 3 days of cover"]],
  },
  {
    key: "cohort-attendance",
    unit: "ACADEMY",
    owner: "ngozi",
    title: "Cohort attendance follow-up",
    summary: "Scholarship students who miss two sessions get a call the same week.",
    frequency: "WEEKLY",
    weekdays: [5],
    dueTime: "15:00",
    priority: "MEDIUM",
    assignees: ["blessing", "samuel"],
    steps: [["Export this week's attendance for the running cohorts"], ["Call every student who missed two or more sessions"], ["Note the reason and next step on their record"], ["Escalate repeat absences to Ngozi"]],
  },
  {
    key: "scholarship-screening",
    unit: "ACADEMY",
    owner: "ngozi",
    title: "Scholarship applications screening",
    summary: "Applicants hear back within a week.",
    frequency: "WEEKLY",
    weekdays: [2],
    dueTime: "16:00",
    priority: "MEDIUM",
    assignees: ["blessing"],
    steps: [["Review new applications against the scholarship criteria"], ["Move qualified applicants to 'Screened' in the Academy pipeline"], ["Send the decision email to each applicant"]],
  },
  {
    key: "month-end",
    unit: "HQ",
    owner: "amaka",
    title: "Month-end expense receipts",
    summary: "Every expense has a receipt before the accountant closes the month.",
    frequency: "MONTHLY",
    dayOfMonth: 28,
    dueTime: "17:00",
    priority: "HIGH",
    assignees: ["aisha"],
    steps: [["List this month's expenses with no receipt attached"], ["Chase each person who logged one"], ["Reconcile card statements against subscriptions"], ["Send the pack to the accountant"]],
  },
  {
    key: "social-calendar",
    unit: "ACADEMY",
    owner: "ngozi",
    title: "Social content calendar",
    summary: "Paused until the marketing hire starts.",
    frequency: "WEEKLY",
    weekdays: [3],
    dueTime: "12:00",
    priority: "LOW",
    assignees: ["samuel"],
    steps: [["Draft next week's posts"], ["Get sign-off from Ngozi"]],
    isActive: false,
  },
];

const HOLIDAYS: [string, string][] = [
  ["2026-10-01", "Independence Day"],
  ["2026-12-25", "Christmas Day"],
  ["2026-12-26", "Boxing Day"],
  ["2027-01-01", "New Year's Day"],
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
  if (await db.user.count()) {
    console.log("Database already has users — skipping seed (use a fresh database).");
    return;
  }

  const today = localDate(new Date());
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const units = new Map<UnitCode, string>();
  for (const u of UNITS) {
    const row = await db.businessUnit.upsert({ where: { code: u.code }, update: {}, create: u });
    units.set(u.code, row.id);
  }

  const roles = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const row = await db.role.upsert({
      where: { key: r.key },
      update: {},
      create: {
        key: r.key,
        name: r.name,
        isSystem: true,
        requires2fa: r.requires2fa,
        description: r.description,
        permissions: { create: grantRows(r) },
      },
    });
    roles.set(r.key, row.id);
  }

  const people = new Map<string, string>();
  for (const p of PEOPLE) {
    const user = await db.user.create({
      data: {
        name: p.name,
        email: p.email,
        passwordHash,
        status: "ACTIVE",
        roleId: roles.get(p.role)!,
        primaryUnitId: units.get(p.unit)!,
        units: { create: (p.extraUnits ?? []).map((u) => ({ unitId: units.get(u)! })) },
      },
    });
    people.set(p.key, user.id);
  }
  const managerOf: Record<string, string> = { chidi: "tunde", fatima: "tunde", blessing: "ngozi", samuel: "ngozi", emeka: "ibrahim", aisha: "amaka", tunde: "amaka", ngozi: "amaka", ibrahim: "amaka", amaka: "kelechi" };
  for (const [staff, manager] of Object.entries(managerOf)) {
    await db.user.update({ where: { id: people.get(staff)! }, data: { managerId: people.get(manager)! } });
  }

  for (const [date, name] of HOLIDAYS) await db.publicHoliday.create({ data: { date: new Date(date), name } });

  const sops = new Map<string, { id: string; steps: { id: string; position: number; title: string }[] }>();
  for (const s of SOPS) {
    const sop = await db.sop.create({
      data: {
        unitId: units.get(s.unit)!,
        ownerId: people.get(s.owner)!,
        title: s.title,
        summary: s.summary,
        frequency: s.frequency,
        weekdays: s.weekdays ?? [],
        dayOfMonth: s.dayOfMonth ?? null,
        dueTime: s.dueTime,
        defaultPriority: s.priority,
        isActive: s.isActive ?? true,
        startsOn: new Date(addDays(today, -21)),
        steps: { create: s.steps.map(([title, detail], i) => ({ position: i + 1, title, detail: detail ?? null })) },
        assignees: { create: s.assignees.map((k) => ({ userId: people.get(k)! })) },
      },
      include: { steps: true },
    });
    sops.set(s.key, sop);
  }

  // ── tasks ──
  type Seeded = {
    title: string;
    unit: UnitCode;
    by: string;
    to: string;
    status: TaskStatus;
    priority?: Priority;
    dueInDays?: number;
    dueTime?: string;
    description?: string;
    sop?: { key: string; date: string; stepsDone: number };
  };
  const ORIGIN_BY_CREATOR = (key: string): "FOUNDER" | "TEAM_LEAD" => (key === "kelechi" ? "FOUNDER" : "TEAM_LEAD");

  const tasks: Seeded[] = [
    // from the founder
    { title: "Prepare the Akwa Ibom Ministry of Education pitch deck", unit: "ACADEMY", by: "kelechi", to: "ngozi", status: "IN_PROGRESS", priority: "URGENT", dueInDays: 2, description: "Focus on the scholarship model and outcomes from cohorts 1–3. Presentation is with the Commissioner's team." },
    { title: "Get WHMCS API credentials set up for Figuraid OS", unit: "FIGUREWEB", by: "kelechi", to: "tunde", status: "TODO", priority: "HIGH", dueInDays: 1, description: "API role with read access to clients, invoices and domains. Whitelist the OS server IP." },
    { title: "Call MTN wholesale about CLI route pricing", unit: "TELECOM", by: "kelechi", to: "ibrahim", status: "TODO", priority: "HIGH", dueInDays: 0, dueTime: "15:00" },
    { title: "Draft Q1 hiring plan for all units", unit: "HQ", by: "kelechi", to: "amaka", status: "BLOCKED", priority: "MEDIUM", dueInDays: 6, description: "Blocked: waiting on Q4 revenue numbers from Finance." },
    { title: "Submit Meta Business verification documents", unit: "HQ", by: "kelechi", to: "amaka", status: "DONE", priority: "HIGH", dueInDays: -3 },
    // from team leads
    { title: "Migrate three clients from shared cPanel to the reseller server", unit: "FIGUREWEB", by: "tunde", to: "chidi", status: "IN_PROGRESS", priority: "MEDIUM", dueInDays: 3 },
    { title: "Quote: business email for Uyo hotel (40 mailboxes)", unit: "FIGUREWEB", by: "tunde", to: "fatima", status: "BLOCKED", priority: "MEDIUM", dueInDays: 1, description: "Waiting on the client's final headcount." },
    { title: "Set up SSL for figureweb.ng staging", unit: "FIGUREWEB", by: "tunde", to: "chidi", status: "TODO", priority: "LOW", dueInDays: 5 },
    { title: "Send the Cohort 4 welcome pack", unit: "ACADEMY", by: "ngozi", to: "samuel", status: "TODO", priority: "HIGH", dueInDays: 1 },
    { title: "Book the venue for Cohort 4 graduation", unit: "ACADEMY", by: "ngozi", to: "blessing", status: "DONE", priority: "MEDIUM", dueInDays: -2 },
    { title: "Chase Airtel on the week 41 minutes dispute", unit: "TELECOM", by: "ibrahim", to: "emeka", status: "IN_PROGRESS", priority: "HIGH", dueInDays: -1, description: "Our CDRs show 412,880 billed minutes; theirs show 398,115." },
    { title: "Load the new vendor rate deck effective 1 November", unit: "TELECOM", by: "ibrahim", to: "emeka", status: "TODO", priority: "MEDIUM", dueInDays: 4 },
    { title: "Reconcile October Paystack settlements", unit: "HQ", by: "amaka", to: "aisha", status: "TODO", priority: "MEDIUM", dueInDays: 2 },
    // from SOP schedules (earlier occurrences; today's are left for "Generate due tasks")
    { title: "", unit: "TELECOM", by: "ibrahim", to: "emeka", status: "DONE", sop: { key: "prepaid-check", date: addDays(today, -2), stepsDone: 3 } },
    { title: "", unit: "TELECOM", by: "ibrahim", to: "emeka", status: "IN_PROGRESS", sop: { key: "prepaid-check", date: addDays(today, -1), stepsDone: 1 } },
    { title: "", unit: "FIGUREWEB", by: "tunde", to: "chidi", status: "DONE", sop: { key: "support-sweep", date: addDays(today, -1), stepsDone: 3 } },
  ];

  const byStatus = new Map<TaskStatus, Seeded[]>();
  for (const t of tasks) byStatus.set(t.status, [...(byStatus.get(t.status) ?? []), t]);

  for (const [status, list] of byStatus) {
    const ranks = initialRanks(list.length);
    for (const [i, t] of list.entries()) {
      const due = t.sop ? null : t.dueInDays !== undefined ? zonedDateTime(addDays(today, t.dueInDays), t.dueTime ?? "17:00") : null;
      const done = status === "DONE" ? new Date(Date.now() - 86_400_000) : null;
      if (t.sop) {
        const spec = SOPS.find((s) => s.key === t.sop!.key)!;
        const sop = sops.get(t.sop.key)!;
        const steps = [...sop.steps].sort((a, b) => a.position - b.position);
        await db.task.create({
          data: {
            title: spec.title,
            description: spec.summary,
            unitId: units.get(t.unit)!,
            assigneeId: people.get(t.to)!,
            createdById: people.get(t.by)!,
            priority: spec.priority,
            dueAt: zonedDateTime(t.sop.date, spec.dueTime),
            origin: "SOP",
            source: "SYSTEM",
            status,
            boardRank: ranks[i]!,
            sopId: sop.id,
            sopOccurrenceKey: occurrenceKey(t.sop.date, people.get(t.to)!),
            completedAt: done,
            startedAt: status === "TODO" ? null : new Date(),
            checklist: {
              create: steps.map((s) => ({ position: s.position, label: s.title, sopStepId: s.id, doneAt: s.position <= t.sop!.stepsDone ? new Date() : null })),
            },
          },
        });
        await db.sop.update({ where: { id: sop.id }, data: { lastGeneratedOn: new Date(t.sop.date) } });
      } else {
        await db.task.create({
          data: {
            title: t.title,
            description: t.description ?? null,
            unitId: units.get(t.unit)!,
            assigneeId: people.get(t.to)!,
            createdById: people.get(t.by)!,
            priority: t.priority ?? "MEDIUM",
            dueAt: due,
            origin: ORIGIN_BY_CREATOR(t.by),
            status,
            boardRank: ranks[i]!,
            completedAt: done,
            startedAt: status === "TODO" ? null : new Date(),
          },
        });
      }
    }
  }

  console.log(`Seeded ${PEOPLE.length} people, ${SOPS.length} SOPs, ${tasks.length} tasks.`);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
