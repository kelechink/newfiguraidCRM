import "server-only";
import type { PermModule } from "@/server/authz/catalog";
import { can, type Ctx } from "@/server/authz/context";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // key into the client icon map
  keywords?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

type Def = NavItem & { any: [PermModule, "VIEW" | "CREATE"][] };

// Single source of truth for navigation, the command palette and the sidebar.
// An item shows only if the caller holds at least one of its permissions.
const NAV: { label: string; items: Def[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/home", label: "Home", icon: "home", any: [["dashboard.today", "VIEW"], ["dashboard.admin", "VIEW"]], keywords: "dashboard command centre today" },
      { href: "/work/tasks", label: "Tasks", icon: "tasks", any: [["tasks", "VIEW"]], keywords: "board kanban todo" },
      { href: "/work/sops", label: "SOP templates", icon: "sops", any: [["sops", "VIEW"]], keywords: "procedures checklist" },
      { href: "/work/targets", label: "Targets & reports", icon: "targets", any: [["targets", "VIEW"], ["reports.daily", "VIEW"]], keywords: "scorecard end of day leaderboard" },
      { href: "/work/messages", label: "Messages", icon: "messages", any: [["messaging", "VIEW"]], keywords: "chat dm channel announcement" },
      { href: "/work/attendance", label: "Attendance", icon: "attendance", any: [["attendance", "VIEW"]], keywords: "clock in out leave late" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/customers/inbox", label: "Inbox", icon: "inbox", any: [["inbox", "VIEW"]], keywords: "whatsapp instagram facebook email chat" },
      { href: "/customers/contacts", label: "Contacts", icon: "contacts", any: [["crm.contacts", "VIEW"]], keywords: "leads companies people" },
      { href: "/customers/pipelines", label: "Pipelines", icon: "pipelines", any: [["crm.deals", "VIEW"]], keywords: "deals kanban sales" },
      { href: "/customers/tickets", label: "Support tickets", icon: "tickets", any: [["support.tickets", "VIEW"]], keywords: "helpdesk csat" },
      { href: "/customers/academy", label: "Academy", icon: "academy", any: [["academy", "VIEW"]], keywords: "students cohorts courses certificates" },
      { href: "/customers/marketing", label: "Marketing", icon: "marketing", any: [["marketing.campaigns", "VIEW"], ["email.sequences", "VIEW"], ["crm.forms", "VIEW"]], keywords: "campaigns ads utm qr sequences forms brevo meta" },
      { href: "/customers/tenders", label: "Tenders", icon: "tenders", any: [["tenders", "VIEW"]], keywords: "government bids akwa ibom" },
      { href: "/customers/referrals", label: "Referrals", icon: "referrals", any: [["referrals", "VIEW"]], keywords: "commission partners" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/money", label: "Finance", icon: "finance", any: [["finance.reports", "VIEW"], ["finance.income", "VIEW"], ["finance.expenses", "CREATE"]], keywords: "income expenses profit" },
      { href: "/money/invoices", label: "Invoices", icon: "invoices", any: [["finance.invoices", "VIEW"]], keywords: "quotes receivables billing" },
      { href: "/money/subscriptions", label: "Subscriptions", icon: "subscriptions", any: [["subscriptions", "VIEW"]], keywords: "saas renewals tools" },
      { href: "/money/procurement", label: "Procurement & domains", icon: "procurement", any: [["procurement", "VIEW"]], keywords: "resale margin domains suppliers hosting ssl" },
      { href: "/money/telecom", label: "Telecom", icon: "telecom", any: [["telecom.carriers", "VIEW"], ["telecom.traffic", "VIEW"], ["telecom.billing", "VIEW"]], keywords: "carriers routes rates minutes margin" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/team/staff", label: "Staff", icon: "staff", any: [["hr.staff", "VIEW"]], keywords: "people onboarding exit hr" },
      { href: "/team/contracts", label: "Contracts & policies", icon: "documents", any: [["hr.contracts", "VIEW"]], keywords: "templates onboarding pack lateness policy" },
      { href: "/team/payroll", label: "Payroll", icon: "payroll", any: [["payroll", "VIEW"]], keywords: "salary payslips deductions" },
      { href: "/team/documents", label: "Documents", icon: "documents", any: [["documents", "VIEW"]], keywords: "vault contracts nda cac signatures" },
      { href: "/me", label: "My pay & attendance", icon: "me", any: [["attendance", "VIEW"]], keywords: "payslip deductions late" },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: "settings", any: [["settings", "VIEW"], ["roles", "VIEW"], ["audit", "VIEW"], ["hr.staff", "VIEW"], ["inbox.routing", "VIEW"], ["privacy.dsr", "VIEW"]], keywords: "users roles permissions audit integrations" }],
  },
];

export function navFor(ctx: Ctx): NavGroup[] {
  return NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => i.any.some(([m, a]) => can(ctx, m, a))).map(({ any: _any, ...item }) => item),
  })).filter((g) => g.items.length > 0);
}
