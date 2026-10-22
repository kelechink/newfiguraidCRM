import { Crown, Repeat2, UsersRound } from "lucide-react";
import { ORIGIN_LABEL, type TaskOrigin } from "@/domain/tasks/origin";
import { cn } from "@/ui/cn";

const STYLE: Record<TaskOrigin, { icon: typeof Crown; className: string }> = {
  FOUNDER: { icon: Crown, className: "bg-accent-soft text-accent-ink border-accent/25" },
  TEAM_LEAD: { icon: UsersRound, className: "bg-surface-2 text-ink-2 border-line" },
  SOP: { icon: Repeat2, className: "bg-success/10 text-success border-success/20" },
};

export function OriginBadge({ origin, className }: { origin: TaskOrigin; className?: string }) {
  const { icon: Icon, className: tone } = STYLE[origin];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-[5px] border px-1.5 text-2xs font-medium", tone, className)}>
      <Icon className="size-3" strokeWidth={2} />
      {ORIGIN_LABEL[origin]}
    </span>
  );
}
