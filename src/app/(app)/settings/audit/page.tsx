import type { Metadata } from "next";
import { AuditViewer } from "@/components/settings/audit-viewer";
import { requireCtx } from "@/server/auth/session";
import { listAudit } from "@/server/modules/admin/audit-service";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const rows = await listAudit(ctx, { action: sp.action || undefined, entity: sp.entity || undefined });
  return <AuditViewer rows={rows} filter={{ action: sp.action ?? "", entity: sp.entity ?? "" }} />;
}
