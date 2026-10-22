// The three task origins. Origin is derived on the server from who (or what)
// created the task — it is never accepted from the client, so a staff member
// cannot dress a task up as coming from the founder.

export type TaskOrigin = "FOUNDER" | "TEAM_LEAD" | "SOP";

export const FOUNDER_ROLE_KEY = "super_admin";

export function originForCreator(creatorRoleKey: string): Exclude<TaskOrigin, "SOP"> {
  return creatorRoleKey === FOUNDER_ROLE_KEY ? "FOUNDER" : "TEAM_LEAD";
}

export const ORIGIN_LABEL: Record<TaskOrigin, string> = {
  FOUNDER: "Founder",
  TEAM_LEAD: "Team lead",
  SOP: "SOP",
};
