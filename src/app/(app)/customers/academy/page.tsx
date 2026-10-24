import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Courses } from "@/components/academy/academy";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listCourses } from "@/server/modules/academy/service";
import { listUnits } from "@/server/modules/shell/service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Academy" };

export default async function AcademyPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "academy", "VIEW")) notFound();
  const [courses, units] = await Promise.all([listCourses(ctx), listUnits()]);
  const academy = units.find((u) => u.code === "ACADEMY");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Figure Academy" description="Courses, cohorts, scholarships and verifiable certificates." />
      <Courses courses={courses} unitId={academy?.id ?? null} canEdit={can(ctx, "academy", "CREATE")} />
    </div>
  );
}
