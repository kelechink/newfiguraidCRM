import type { Metadata } from "next";
import { Leaderboard } from "@/components/targets/leaderboard";
import { MyWeek } from "@/components/targets/my-week";
import { ReportsList } from "@/components/targets/reports-list";
import { TeamScorecards } from "@/components/targets/team-scorecards";
import { localDate } from "@/domain/sop/schedule";
import { scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { currentUnit } from "@/server/modules/shell/service";
import { listReports, myRecentReports, myWeek, scorecards, weekStartOf } from "@/server/modules/targets/service";
import { PageHeader } from "@/ui/page-header";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Targets & reports" };

export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const today = localDate(new Date());
  const teamScope = scopeOf(ctx, "targets", "VIEW");
  const reportScope = scopeOf(ctx, "reports.daily", "VIEW");
  const canTeam = teamScope === "UNIT" || teamScope === "ALL";
  const canReports = reportScope === "UNIT" || reportScope === "ALL";
  const unit = await currentUnit();
  const tabs = [
    { key: "me", href: "/work/targets", label: "My week" },
    ...(canTeam ? [{ key: "team", href: "/work/targets?tab=team", label: "Team scorecards" }, { key: "board", href: "/work/targets?tab=board", label: "Leaderboard" }] : []),
    ...(canReports ? [{ key: "reports", href: "/work/targets?tab=reports", label: "Daily reports" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "me";

  let body: React.ReactNode;
  if (tab === "me") {
    const [week, reports] = await Promise.all([myWeek(ctx), myRecentReports(ctx)]);
    body = <MyWeek weekStart={week.weekStart} targets={week.targets} reports={reports} today={today} />;
  } else if (tab === "team" || tab === "board") {
    const rows = await scorecards(ctx, { unitId: unit?.id ?? null });
    const createScope = scopeOf(ctx, "targets", "CREATE");
    body = tab === "team" ? <TeamScorecards rows={rows} weekStart={weekStartOf(today)} canSet={createScope === "UNIT" || createScope === "ALL"} /> : <Leaderboard rows={rows} />;
  } else {
    const r = await listReports(ctx, { date: sp.date, unitId: unit?.id ?? null });
    body = <ReportsList date={r.date} rows={r.rows} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Targets & reports" description="Weekly targets, scorecards and end-of-day reports." />
      <LinkTabs tabs={tabs} active={tab} />
      {body}
    </div>
  );
}
