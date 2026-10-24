// Permission catalogue. Modules are code so every check is type-checked;
// which role holds what is data (RolePermission / UserGrant rows).
// `sensitive` permissions can only be granted by the Super Admin (PRD §3).

export const ACTIONS = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"] as const;
export type PermAction = (typeof ACTIONS)[number];

export const SCOPES = ["OWN", "UNIT", "ALL"] as const;
export type PermScope = (typeof SCOPES)[number];

type ModuleDef = { label: string; group: string; sensitive?: boolean; hint?: string };

export const MODULES = {
  // Work
  "dashboard.admin": { label: "Admin portal (revenue, KPIs)", group: "Work" },
  "dashboard.today": { label: "Today at a glance", group: "Work" },
  tasks: { label: "Tasks", group: "Work" },
  sops: { label: "SOP templates", group: "Work" },
  targets: { label: "Weekly targets & scorecards", group: "Work" },
  "reports.daily": { label: "End-of-day reports", group: "Work" },
  messaging: { label: "Internal messaging", group: "Work" },
  announcements: { label: "Announcements", group: "Work" },
  attendance: { label: "Attendance", group: "Work" },
  "attendance.review": { label: "Attendance review & devices", group: "Work" },
  leave: { label: "Leave requests", group: "Work" },
  // Customers
  inbox: { label: "Unified inbox", group: "Customers" },
  "inbox.routing": { label: "Inbox routing rules & AI", group: "Customers" },
  "crm.contacts": { label: "Contacts & companies", group: "Customers" },
  "crm.deals": { label: "Deals & pipelines", group: "Customers" },
  "crm.forms": { label: "Lead forms", group: "Customers" },
  "email.sequences": { label: "Email sequences & broadcasts", group: "Customers" },
  "marketing.campaigns": { label: "Campaigns, UTM & ad spend", group: "Customers" },
  "support.tickets": { label: "Support tickets", group: "Customers" },
  academy: { label: "Academy: courses, cohorts, students", group: "Customers" },
  "academy.certificates": { label: "Academy certificates", group: "Customers" },
  tenders: { label: "Tender & bid tracker", group: "Customers" },
  referrals: { label: "Referral programme", group: "Customers" },
  // Money
  "finance.income": { label: "Income & payments", group: "Money" },
  "finance.expenses": { label: "Expenses", group: "Money" },
  "finance.invoices": { label: "Invoices & quotes", group: "Money" },
  "finance.bills": { label: "Bills & payables", group: "Money" },
  "finance.reports": { label: "Finance reports & summaries", group: "Money" },
  "finance.cashflow": { label: "Cash-flow forecast", group: "Money", sensitive: true },
  subscriptions: { label: "Subscriptions", group: "Money" },
  procurement: { label: "Procurement, resale & domains", group: "Money" },
  "telecom.carriers": { label: "Carriers", group: "Money" },
  "telecom.routes": { label: "Routes & sell rates", group: "Money" },
  "telecom.buy_rates": { label: "Vendor buy rates", group: "Money", sensitive: true },
  "telecom.margins": { label: "Telecom margins", group: "Money", sensitive: true },
  "telecom.traffic": { label: "Traffic & CDR upload", group: "Money" },
  "telecom.billing": { label: "Telecom invoicing & statements", group: "Money" },
  "telecom.prepaid": { label: "Prepaid balances & credit", group: "Money" },
  "telecom.disputes": { label: "Disputes", group: "Money" },
  "referrals.payouts": { label: "Referral payouts", group: "Money" },
  // Team
  "hr.staff": { label: "Staff records & onboarding", group: "Team" },
  "hr.contracts": { label: "Contract templates & packs", group: "Team" },
  "hr.deductions": { label: "Lateness & deductions", group: "Team" },
  "hr.salaries": { label: "Salaries & allowances", group: "Team", sensitive: true },
  "hr.bank_details": { label: "Bank & ID details", group: "Team", sensitive: true },
  payroll: { label: "Payroll runs", group: "Team", sensitive: true },
  "payroll.signoff": { label: "Payroll sign-off above limit", group: "Team", sensitive: true },
  documents: { label: "Document vault", group: "Team" },
  // Admin
  "privacy.dsr": { label: "Data subject requests", group: "Admin" },
  settings: { label: "Settings, users & integrations", group: "Admin" },
  "settings.billing": { label: "Billing settings", group: "Admin", sensitive: true },
  roles: { label: "Roles & permissions", group: "Admin", sensitive: true },
  audit: { label: "Audit log", group: "Admin", sensitive: true },
  exports: { label: "Data exports (CSV/PDF)", group: "Admin", sensitive: true, hint: "CREATE = may export" },
} as const satisfies Record<string, ModuleDef>;
export type PermModule = keyof typeof MODULES;

export const MODULE_KEYS = Object.keys(MODULES) as PermModule[];

export function isModule(key: string): key is PermModule {
  return key in MODULES;
}

export function isSensitive(module: string): boolean {
  return isModule(module) && "sensitive" in MODULES[module] && MODULES[module].sensitive === true;
}

export function widerScope(a: PermScope, b: PermScope): PermScope {
  return SCOPES.indexOf(a) >= SCOPES.indexOf(b) ? a : b;
}
