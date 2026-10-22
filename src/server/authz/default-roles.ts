import type { PermAction, PermModule, PermScope } from "./catalog";

// Shipped default roles (PRD §3). Super Admin can edit or clone these in
// settings; the seed only creates them. Each grant: [module, actions, scope].
type Grant = [PermModule, PermAction[], PermScope];

export interface DefaultRole {
  key: string;
  name: string;
  requires2fa: boolean;
  grants: Grant[];
}

const ALL_ACTIONS: PermAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"];
const ASSIGN_WORK: PermAction[] = ["VIEW", "CREATE", "EDIT", "DELETE"];
const MANAGE_SOPS: PermAction[] = ["VIEW", "CREATE", "EDIT"];

// Staff-type roles: work their own tasks, read the procedures for their unit.
const OWN_WORK: Grant[] = [
  ["tasks", ["VIEW", "EDIT"], "OWN"],
  ["sops", ["VIEW"], "UNIT"],
];

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    requires2fa: true,
    grants: [
      ["tasks", ALL_ACTIONS, "ALL"],
      ["sops", ALL_ACTIONS, "ALL"],
    ],
  },
  {
    key: "admin",
    name: "Admin",
    requires2fa: true,
    grants: [
      ["tasks", ALL_ACTIONS, "ALL"],
      ["sops", ALL_ACTIONS, "ALL"],
    ],
  },
  {
    key: "ops_manager",
    name: "Operations Manager",
    requires2fa: true,
    grants: [
      ["tasks", ASSIGN_WORK, "ALL"],
      ["sops", MANAGE_SOPS, "ALL"],
    ],
  },
  {
    key: "unit_manager",
    name: "Manager (unit)",
    requires2fa: false,
    grants: [
      ["tasks", ASSIGN_WORK, "UNIT"],
      ["sops", MANAGE_SOPS, "UNIT"],
    ],
  },
  { key: "finance", name: "Finance", requires2fa: true, grants: OWN_WORK },
  { key: "hr", name: "HR", requires2fa: true, grants: OWN_WORK },
  { key: "marketing", name: "Marketing", requires2fa: false, grants: OWN_WORK },
  { key: "telecom_ops", name: "Telecom Operations", requires2fa: false, grants: OWN_WORK },
  { key: "academy_coordinator", name: "Academy Coordinator", requires2fa: false, grants: OWN_WORK },
  { key: "staff", name: "Staff", requires2fa: false, grants: OWN_WORK },
  // Inbox and tickets only; Auditor is read-only finance + audit. Neither touches tasks.
  { key: "support_agent", name: "Support Agent", requires2fa: false, grants: [] },
  { key: "auditor", name: "Auditor", requires2fa: true, grants: [] },
];
