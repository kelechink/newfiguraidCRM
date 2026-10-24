import { Badge } from "./badge";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

// One place that decides what colour each status is, so the whole app agrees.
const TONE: Record<string, Tone> = {
  ACTIVE: "success", APPROVED: "success", PAID: "success", CONFIRMED: "success", COMPLETED: "success", SIGNED: "success",
  RESOLVED: "success", CLOSED: "neutral", WON: "success", AWARDED: "success", VALID: "success", DONE: "success", CLEAN: "success",
  SETTLED: "success", RESOLVED_IN_OUR_FAVOUR: "success", SIGNED_OFF: "success", PRESENT: "success", LIVE: "success", SENT: "accent",
  DRAFT: "neutral", PENDING: "warning", SUBMITTED: "accent", IN_REVIEW: "accent", OPEN: "accent", NEW: "accent", IN_PROGRESS: "accent",
  PARTIALLY_PAID: "warning", PARTIALLY_SIGNED: "warning", AWAITING_SIGNATURE: "warning", PENDING_CUSTOMER: "warning", ON_HOLD: "neutral",
  OVERDUE: "danger", REJECTED: "danger", FAILED: "danger", LOST: "danger", REVOKED: "danger", DISPUTED: "danger", VOID: "neutral",
  CANCELLED: "neutral", EXPIRED: "danger", LATE: "warning", ABSENT: "danger", ON_LEAVE: "neutral", HOLIDAY: "neutral", BLOCKED: "danger",
  TRIAL: "accent", PAUSED: "neutral", SUSPENDED: "danger", EXITED: "neutral", INVITED: "warning", ONBOARDING: "warning",
  STAFF_SIGNED: "accent", GENERATED: "neutral", RATING: "accent",
  PENDING_RECONCILIATION: "warning", REFUNDED: "neutral", RESOLVED_IN_THEIR_FAVOUR: "warning", URGENT: "danger", HIGH: "warning",
};

export function humanize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={TONE[status] ?? "neutral"}>{label ?? humanize(status)}</Badge>;
}
