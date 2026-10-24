import { MODULE_KEYS, type PermAction, type PermModule, type PermScope } from "./catalog";

// Shipped default roles (PRD §3). Super Admin can edit, clone or replace these
// in Settings → Roles; the seed only creates them. Each grant: [module, actions, scope].
type Grant = [PermModule, PermAction[], PermScope];

export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  requires2fa: boolean;
  grants: Grant[];
}

const ALL: PermAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"];
const V: PermAction[] = ["VIEW"];
const VC: PermAction[] = ["VIEW", "CREATE"];
const VCE: PermAction[] = ["VIEW", "CREATE", "EDIT"];
const VCED: PermAction[] = ["VIEW", "CREATE", "EDIT", "DELETE"];
const VE: PermAction[] = ["VIEW", "EDIT"];
const VA: PermAction[] = ["VIEW", "APPROVE"];

/** What every employee gets: their own attendance, leave, messages, today page. */
const EMPLOYEE_BASE: Grant[] = [
  ["dashboard.today", V, "OWN"],
  ["attendance", VC, "OWN"],
  ["leave", VC, "OWN"],
  ["messaging", VC, "ALL"],
  ["announcements", V, "ALL"],
  ["hr.deductions", V, "OWN"],
  ["documents", V, "OWN"],
  ["reports.daily", VC, "OWN"],
  ["targets", V, "OWN"],
  ["finance.expenses", VC, "OWN"], // expense claims with receipts
];

const OWN_WORK: Grant[] = [
  ...EMPLOYEE_BASE,
  ["tasks", VE, "OWN"],
  ["sops", V, "UNIT"],
];

function everything(except: PermModule[] = []): Grant[] {
  return MODULE_KEYS.filter((m) => !except.includes(m)).map((m) => [m, ALL, "ALL"] as Grant);
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Everything, including finance, settings, audit log and role management.",
    requires2fa: true,
    grants: everything(),
  },
  {
    key: "admin",
    name: "Admin",
    description: "Everything except billing settings, role management and payroll sign-off.",
    requires2fa: true,
    grants: everything(["settings.billing", "roles", "payroll.signoff"]),
  },
  {
    key: "ops_manager",
    name: "Operations Manager",
    description: "Oversees every unit's work, pipelines, inbox SLAs, attendance and tickets. No payroll, salaries, bank details or settings.",
    requires2fa: true,
    grants: [
      ...EMPLOYEE_BASE,
      ["dashboard.admin", V, "ALL"],
      ["dashboard.today", V, "ALL"],
      ["tasks", VCED, "ALL"],
      ["sops", VCE, "ALL"],
      ["targets", VCE, "ALL"],
      ["reports.daily", V, "ALL"],
      ["announcements", VC, "ALL"],
      ["attendance", V, "ALL"],
      ["attendance.review", VA, "ALL"],
      ["leave", VA, "ALL"],
      ["inbox", VCE, "ALL"],
      ["inbox.routing", VCE, "ALL"],
      ["crm.contacts", VCE, "ALL"],
      ["crm.deals", VCE, "ALL"],
      ["crm.forms", V, "ALL"],
      ["support.tickets", VCE, "ALL"],
      ["academy", V, "ALL"],
      ["tenders", VCE, "ALL"],
      ["referrals", V, "ALL"],
      ["hr.staff", V, "ALL"],
      ["telecom.carriers", V, "ALL"],
      ["telecom.routes", V, "ALL"],
      ["telecom.traffic", V, "ALL"],
      ["finance.reports", V, "ALL"],
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "All units' finance, telecom billing and balances, subscriptions, procurement, cash flow and payroll processing. No CRM, inbox or settings.",
    requires2fa: true,
    grants: [
      ...OWN_WORK,
      ["finance.income", ALL, "ALL"],
      ["finance.expenses", ALL, "ALL"],
      ["finance.invoices", ALL, "ALL"],
      ["finance.bills", ALL, "ALL"],
      ["finance.reports", ["VIEW", "EXPORT"], "ALL"],
      ["finance.cashflow", V, "ALL"],
      ["subscriptions", VCED, "ALL"],
      ["procurement", VCED, "ALL"],
      ["telecom.carriers", V, "ALL"],
      ["telecom.routes", V, "ALL"],
      ["telecom.buy_rates", V, "ALL"],
      ["telecom.margins", V, "ALL"],
      ["telecom.traffic", V, "ALL"],
      ["telecom.billing", ALL, "ALL"],
      ["telecom.prepaid", VCE, "ALL"],
      ["telecom.disputes", VCE, "ALL"],
      ["referrals.payouts", V, "ALL"],
      ["hr.salaries", V, "ALL"],
      ["hr.bank_details", V, "ALL"],
      ["payroll", ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT"], "ALL"],
      ["exports", ["CREATE"], "ALL"],
    ],
  },
  {
    key: "hr",
    name: "HR",
    description: "Onboarding, staff records, contract packs, attendance review, lateness, leave and exits. Sees deductions, not salaries or bank details.",
    requires2fa: true,
    grants: [
      ...OWN_WORK,
      ["hr.staff", VCE, "ALL"],
      ["hr.contracts", VCE, "ALL"],
      ["hr.deductions", VCE, "ALL"],
      ["attendance", V, "ALL"],
      ["attendance.review", VA, "ALL"],
      ["leave", VA, "ALL"],
      ["documents", VC, "ALL"],
      ["announcements", VC, "ALL"],
      ["dashboard.today", V, "ALL"],
    ],
  },
  {
    key: "unit_manager",
    name: "Manager (unit)",
    description: "Own business unit: leads, pipeline, team tasks, inbox, attendance and the unit finance summary.",
    requires2fa: false,
    grants: [
      ...EMPLOYEE_BASE,
      ["dashboard.today", V, "UNIT"],
      ["tasks", VCED, "UNIT"],
      ["sops", VCE, "UNIT"],
      ["targets", VCE, "UNIT"],
      ["reports.daily", V, "UNIT"],
      ["announcements", VC, "UNIT"],
      ["attendance", V, "UNIT"],
      ["attendance.review", VA, "UNIT"],
      ["leave", VA, "UNIT"],
      ["inbox", VCE, "UNIT"],
      ["crm.contacts", VCE, "UNIT"],
      ["crm.deals", VCE, "UNIT"],
      ["crm.forms", VCE, "UNIT"],
      ["support.tickets", VCE, "UNIT"],
      ["academy", VCE, "UNIT"],
      ["tenders", VCE, "UNIT"],
      ["referrals", V, "UNIT"],
      ["finance.reports", V, "UNIT"],
      ["finance.expenses", VC, "UNIT"],
      ["telecom.carriers", V, "UNIT"],
      ["telecom.routes", V, "UNIT"],
      ["telecom.traffic", V, "UNIT"],
    ],
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Campaigns, Meta Ads, email sequences, forms, lead sources and attribution. No finance beyond ad spend.",
    requires2fa: false,
    grants: [
      ...OWN_WORK,
      ["marketing.campaigns", ALL, "ALL"],
      ["email.sequences", VCED, "ALL"],
      ["crm.forms", VCED, "ALL"],
      ["crm.contacts", V, "ALL"],
      ["crm.deals", V, "ALL"],
      ["referrals", VCE, "ALL"],
    ],
  },
  {
    key: "telecom_ops",
    name: "Telecom Operations",
    description: "Carriers, routes, sell rates, minutes, CDR upload, disputes and vendor balances. No buy rates or margins unless granted.",
    requires2fa: false,
    grants: [
      ...OWN_WORK,
      ["telecom.carriers", VCE, "ALL"],
      ["telecom.routes", VCE, "ALL"],
      ["telecom.traffic", VCE, "ALL"],
      ["telecom.disputes", VCE, "ALL"],
      ["telecom.prepaid", V, "ALL"],
      ["crm.contacts", VCE, "OWN"],
      ["crm.deals", VCE, "OWN"],
      ["inbox", VE, "OWN"],
    ],
  },
  {
    key: "academy_coordinator",
    name: "Academy Coordinator",
    description: "Students, cohorts, scholarships, attendance and certificates.",
    requires2fa: false,
    grants: [
      ...OWN_WORK,
      ["academy", VCE, "UNIT"],
      ["academy.certificates", VCE, "UNIT"],
      ["crm.contacts", VCE, "UNIT"],
      ["crm.deals", VCE, "OWN"],
      ["inbox", VE, "OWN"],
    ],
  },
  {
    key: "staff",
    name: "Staff",
    description: "Own tasks, assigned leads and conversations, own attendance, targets and deductions.",
    requires2fa: false,
    grants: [
      ...OWN_WORK,
      ["crm.contacts", VCE, "OWN"],
      ["crm.deals", VCE, "OWN"],
      ["inbox", VE, "OWN"],
      ["support.tickets", VE, "OWN"],
    ],
  },
  {
    key: "support_agent",
    name: "Support Agent",
    description: "Inbox and tickets only.",
    requires2fa: false,
    grants: [
      ...EMPLOYEE_BASE,
      ["inbox", VCE, "ALL"],
      ["support.tickets", VCE, "ALL"],
      ["crm.contacts", V, "ALL"],
    ],
  },
  {
    key: "auditor",
    name: "Auditor (external)",
    description: "Read-only finance and audit log. Cannot edit or export without approval; access expires on a set date.",
    requires2fa: true,
    grants: [
      ["finance.income", V, "ALL"],
      ["finance.expenses", V, "ALL"],
      ["finance.invoices", V, "ALL"],
      ["finance.bills", V, "ALL"],
      ["finance.reports", V, "ALL"],
      ["subscriptions", V, "ALL"],
      ["procurement", V, "ALL"],
      ["telecom.billing", V, "ALL"],
      ["audit", V, "ALL"],
    ],
  },
];

/** Flattened rows for seeding/resetting a role. Later duplicates widen, never narrow. */
export function grantRows(role: DefaultRole): { module: PermModule; action: PermAction; scope: PermScope }[] {
  const order: PermScope[] = ["OWN", "UNIT", "ALL"];
  const map = new Map<string, { module: PermModule; action: PermAction; scope: PermScope }>();
  for (const [module, actions, scope] of role.grants) {
    for (const action of actions) {
      const key = `${module}:${action}`;
      const held = map.get(key);
      if (!held || order.indexOf(scope) > order.indexOf(held.scope)) map.set(key, { module, action, scope });
    }
  }
  return [...map.values()];
}
