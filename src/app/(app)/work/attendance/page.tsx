import type { Metadata } from "next";
import { AttendanceExportButton } from "@/components/attendance/export-button";
import { ClockCard } from "@/components/attendance/clock-card";
import { LeavePanel } from "@/components/attendance/leave-panel";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { ReviewQueue } from "@/components/attendance/review-queue";
import { TeamToday } from "@/components/attendance/team-today";
import { localDate } from "@/domain/sop/schedule";
import { can, requireScope, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listExcuses, listLeave, reviewQueue, teamToday } from "@/server/modules/attendance/service";
import { currentUnit } from "@/server/modules/shell/service";
import { PageHeader } from "@/ui/page-header";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ tab?: string; user?: string }> }) {
  const ctx = await requireCtx();
  requireScope(ctx, "attendance", "VIEW");
  const sp = await searchParams;
  const teamScope = scopeOf(ctx, "attendance", "VIEW");
  const canTeam = teamScope === "UNIT" || teamScope === "ALL";
  const canReview = can(ctx, "attendance.review", "VIEW");
  const month = localDate(new Date()).slice(0, 7);

  const tabs = [
    { key: "clock", href: "/work/attendance", label: "Clock in" },
    { key: "month", href: "/work/attendance?tab=month", label: "My month" },
    ...(canTeam ? [{ key: "team", href: "/work/attendance?tab=team", label: "Team today" }] : []),
    ...(canReview ? [{ key: "review", href: "/work/attendance?tab=review", label: "Review" }] : []),
    { key: "leave", href: "/work/attendance?tab=leave", label: "Leave" },
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "clock";

  let body: React.ReactNode = null;
  if (tab === "clock") body = <ClockCard />;
  if (tab === "month") body = <MonthCalendar initialMonth={month} userId={sp.user} self={!sp.user || sp.user === ctx.userId} />;
  if (tab === "team") body = <TeamToday rows={await teamToday(ctx, { unitId: (await currentUnit())?.id ?? null })} />;
  if (tab === "review") {
    const [q, excuses] = await Promise.all([reviewQueue(ctx), listExcuses(ctx)]);
    body = <ReviewQueue punches={q.punches} devices={q.devices} excuses={excuses} />;
  }
  if (tab === "leave") body = <LeavePanel {...await listLeave(ctx)} />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Attendance"
        description="Clock in from your phone — location, selfie and your registered phone are checked automatically."
        actions={canTeam && can(ctx, "exports", "CREATE") ? <AttendanceExportButton month={month} /> : undefined}
      />
      <LinkTabs tabs={tabs} active={tab} />
      {body}
    </div>
  );
}
