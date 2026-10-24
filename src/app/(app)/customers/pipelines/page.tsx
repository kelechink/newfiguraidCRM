import type { Metadata } from "next";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { getBoard, listPipelines } from "@/server/modules/crm/pipeline-service";
import { currentUnit } from "@/server/modules/shell/service";
import { listAssignableUsers } from "@/server/modules/users/service";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesPage({ searchParams }: { searchParams: Promise<{ p?: string; deal?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const unit = await currentUnit();
  const pipelines = await listPipelines(ctx);
  const chosen = pipelines.find((p) => p.id === sp.p) ?? pipelines.find((p) => !unit || p.unit.id === unit.id) ?? pipelines[0];
  const [board, owners] = await Promise.all([chosen ? getBoard(ctx, chosen.id) : null, listAssignableUsers(ctx, "crm.deals")]);
  return (
    <PipelineBoard
      pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, unit: { code: p.unit.code } }))}
      initial={board}
      owners={owners.filter((o) => !board || o.unitIds.includes(board.pipeline.unit.id)).map((o) => ({ id: o.id, name: o.name }))}
      canCreate={can(ctx, "crm.deals", "CREATE")}
      openDealId={sp.deal ?? null}
    />
  );
}
