"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, Plus, Settings2, Trophy, Workflow, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeDue, formatDateTime, money } from "@/lib/format";
import { createDealAction, getDealAction, moveDealAction, saveStagesAction, updateDealAction } from "@/server/modules/crm/actions";
import type { BoardDeal } from "@/server/modules/crm/pipeline-service";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent, SheetContent } from "@/ui/dialog";
import { EmptyState } from "@/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { PageHeader } from "@/ui/page-header";
import { StatusBadge } from "@/ui/status";
import { useToast } from "@/ui/toast";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";
import { SOURCES } from "./contact-controls";

type Stage = { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; probability: number; color: string | null };
type Board = {
  pipeline: { id: string; name: string; unit: { id: string; code: string; name: string } };
  stages: Stage[];
  deals: BoardDeal[];
  lostReasons: { id: string; label: string }[];
  canEdit: boolean;
  canManageStages: boolean;
};
type Cols = Record<string, string[]>;

const toCols = (b: Board): Cols => Object.fromEntries(b.stages.map((s) => [s.id, b.deals.filter((d) => d.stageId === s.id).map((d) => d.id)]));

const columnKeys: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return sortableKeyboardCoordinates(event, args);
  event.preventDefault();
  const { droppableRects, droppableContainers, collisionRect } = args.context;
  if (!collisionRect) return undefined;
  const cols = droppableContainers.getEnabled().filter((c) => String(c.id).startsWith("stage:")).map((c) => droppableRects.get(c.id)).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => a.left - b.left);
  const centre = collisionRect.left + collisionRect.width / 2;
  const here = cols.findIndex((r) => centre >= r.left && centre <= r.left + r.width);
  const next = cols[here + (event.code === "ArrowRight" ? 1 : -1)];
  return next ? { x: next.left + 6, y: next.top + 6 } : undefined;
};

function DealCard({ d, lifted }: { d: BoardDeal; lifted?: boolean }) {
  const due = d.expectedCloseDate && d.status === "OPEN" ? describeDue(d.expectedCloseDate) : null;
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-3 shadow-card transition-[border-color,box-shadow]", lifted ? "rotate-[1.5deg] shadow-lift" : "group-hover:border-line-strong")}>
      <p className="line-clamp-2 text-[13px] font-medium leading-[18px]">{d.title}</p>
      {(d.contact || d.company) && <p className="mt-0.5 truncate text-2xs text-ink-3">{d.company ?? d.contact?.name}</p>}
      <div className="mt-2 flex items-center gap-2 text-2xs">
        <span className="text-[13px] font-semibold tabular">{money(d.value, d.currency, { compact: true })}</span>
        <span className="text-ink-3 tabular">{d.probability}%</span>
        {d.score !== null && d.score >= 60 && <Badge tone="danger">Hot</Badge>}
        <span className="ml-auto">{d.owner && <Avatar id={d.owner.id} name={d.owner.name} size={20} />}</span>
      </div>
      {due && (
        <p className={cn("mt-1.5 inline-flex items-center gap-1 text-2xs font-medium", due.tone === "overdue" ? "text-danger" : due.tone === "today" ? "text-warning" : "text-ink-3")}>
          <CalendarClock className="size-3" /> Close {due.label.replace("Overdue · ", "overdue · ")}
        </p>
      )}
    </div>
  );
}

function SortableDeal({ d, onOpen, disabled }: { d: BoardDeal; onOpen: (id: string) => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group list-none outline-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-label={`${d.title}, ${money(d.value, d.currency)}. Space to move, Enter to open.`}
      onClick={() => onOpen(d.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(d.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <DealCard d={d} />
    </li>
  );
}

function StageColumn({ stage, deals, children }: { stage: Stage; deals: BoardDeal[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const total = deals.reduce((n, d) => n + (d.currency === "NGN" ? d.value : 0), 0);
  const weighted = deals.reduce((n, d) => n + (d.currency === "NGN" ? (d.value * d.probability) / 100 : 0), 0);
  return (
    <section aria-label={stage.name} className="flex w-[280px] shrink-0 snap-start flex-col">
      <header className="px-1">
        <div className="flex h-7 items-center gap-2">
          {stage.kind === "WON" ? <Trophy className="size-3.5 text-success" /> : stage.kind === "LOST" ? <XCircle className="size-3.5 text-danger" /> : <span className="size-2 rounded-full bg-accent/70" />}
          <h2 className="truncate text-[13px] font-semibold">{stage.name}</h2>
          <span className="text-[12px] text-ink-3 tabular">{deals.length}</span>
          {stage.kind === "OPEN" && <span className="ml-auto text-2xs text-ink-3 tabular">{stage.probability}%</span>}
        </div>
        <p className="text-2xs text-ink-3 tabular">{money(total, "NGN", { compact: true })}{stage.kind === "OPEN" && ` · weighted ${money(weighted, "NGN", { compact: true })}`}</p>
      </header>
      <div ref={setNodeRef} className={cn("mt-2 flex min-h-[140px] flex-1 flex-col rounded-xl border border-transparent bg-surface-2/70 p-1.5", isOver && "border-accent/30 bg-accent-soft/40")}>
        {children}
        {deals.length === 0 && <p className="m-auto p-4 text-center text-2xs text-ink-3">Drop deals here</p>}
      </div>
    </section>
  );
}

function NewDeal({ board, onClose, onCreated }: { board: Board; onClose: () => void; onCreated: () => void }) {
  const create = useAction(createDealAction, { success: "Deal added", refresh: false, onSuccess: () => (onCreated(), onClose()) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`New deal · ${board.pipeline.name}`}
        description="A matching contact is reused by email or phone; otherwise one is created."
        footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="new-deal" loading={create.pending}>Add deal</Button></>}
      >
        <form
          id="new-deal"
          className="grid gap-4"
          action={create.formAction((f) => ({
            pipelineId: board.pipeline.id,
            stageId: f.get("stage"),
            title: f.get("title"),
            newContact: f.get("cname") ? { name: f.get("cname"), email: f.get("cemail") || undefined, phone: f.get("cphone") || undefined } : undefined,
            value: f.get("value") || 0,
            currency: f.get("currency"),
            expectedCloseDate: f.get("close") || null,
            sourceChannel: f.get("source") || undefined,
          }))}
        >
          <Field label="Deal name" htmlFor="d-title" error={create.errors.title}><Input id="d-title" name="title" required autoFocus placeholder="e.g. Hosting + email for Uyo Grand Hotel" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contact name" htmlFor="d-cname"><Input id="d-cname" name="cname" /></Field>
            <Field label="Email" htmlFor="d-cemail"><Input id="d-cemail" name="cemail" type="email" /></Field>
            <Field label="Phone" htmlFor="d-cphone"><Input id="d-cphone" name="cphone" type="tel" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_100px_1fr]">
            <Field label="Value" htmlFor="d-value"><Input id="d-value" name="value" type="number" min={0} step="any" /></Field>
            <Field label="Currency" htmlFor="d-cur"><Select id="d-cur" name="currency" defaultValue={board.pipeline.unit.code === "TELECOM" ? "USD" : "NGN"}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Expected close" htmlFor="d-close"><Input id="d-close" name="close" type="date" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stage" htmlFor="d-stage"><Select id="d-stage" name="stage">{board.stages.filter((s) => s.kind === "OPEN").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Source" htmlFor="d-source"><Select id="d-source" name="source" defaultValue="OTHER">{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ reasons, onCancel, onConfirm }: { reasons: { id: string; label: string }[]; onCancel: () => void; onConfirm: (reasonId: string, note: string) => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent title="Why was it lost?" description="Lost reasons show up in reports so we can fix the pattern." footer={<><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant="danger" type="submit" form="lost">Mark lost</Button></>}>
        <form
          id="lost"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onConfirm(String(f.get("reason")), String(f.get("note") ?? ""));
          }}
        >
          <Field label="Reason" htmlFor="l-reason"><Select id="l-reason" name="reason" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)]}</Select></Field>
          <Field label="Note" htmlFor="l-note"><Textarea id="l-note" name="note" placeholder="Optional detail" /></Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DealSheet({ dealId, owners, canEdit, onClose, onChanged }: { dealId: string | null; owners: { id: string; name: string }[]; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [deal, setDeal] = useState<Extract<Awaited<ReturnType<typeof getDealAction>>, { ok: true }>["data"] | null>(null);
  const save = useAction(updateDealAction, { success: "Saved", refresh: false, onSuccess: () => (onChanged(), dealId && getDealAction(dealId).then((r) => r.ok && setDeal(r.data))) });
  useEffect(() => {
    setDeal(null);
    if (dealId) void getDealAction(dealId).then((r) => r.ok && setDeal(r.data));
  }, [dealId]);
  return (
    <Dialog open={!!dealId} onOpenChange={(o) => !o && onClose()}>
      {dealId && (
        <SheetContent title={deal?.title ?? "Loading…"} header={deal && <div className="flex items-center gap-2"><StatusBadge status={deal.status} /><span className="text-2xs text-ink-3">{deal.stage}</span></div>}>
          {deal && (
            <div className="grid gap-5">
              {deal.contact && (
                <Link href={`/customers/contacts/${deal.contact.id}`} className="flex items-center gap-2.5 rounded-lg border border-line p-2.5 hover:border-line-strong">
                  <Avatar id={deal.contact.id} name={deal.contact.name} size={28} />
                  <span className="min-w-0 text-[13px]"><span className="block font-medium">{deal.contact.name}</span><span className="block truncate text-2xs text-ink-3">{deal.contact.email ?? deal.contact.phone}</span></span>
                </Link>
              )}
              {deal.lostReason && <p className="rounded-md bg-danger/5 px-3 py-2 text-[12.5px] text-danger">Lost: {deal.lostReason}{deal.lostNote && ` — ${deal.lostNote}`}</p>}
              {deal.referral && <p className="rounded-md bg-accent-soft px-3 py-2 text-[12.5px] text-accent-ink">Referred by {deal.referral.referrer} ({deal.referral.code}){deal.referral.commission !== null && ` · commission ${money(deal.referral.commission)}`}</p>}
              <form
                className="grid gap-3"
                action={save.formAction((f) => ({
                  dealId: deal.id,
                  title: f.get("title"),
                  value: f.get("value"),
                  currency: f.get("currency"),
                  probability: f.get("prob") === "" ? null : Number(f.get("prob")),
                  expectedCloseDate: f.get("close") || null,
                  ownerId: f.get("owner") || null,
                }))}
              >
                <Field label="Name" htmlFor="s-title"><Input id="s-title" name="title" defaultValue={deal.title} disabled={!canEdit} /></Field>
                <div className="grid grid-cols-[1fr_90px] gap-3">
                  <Field label="Value" htmlFor="s-value"><Input id="s-value" name="value" type="number" min={0} step="any" defaultValue={deal.value} disabled={!canEdit} /></Field>
                  <Field label="Currency" htmlFor="s-cur"><Select id="s-cur" name="currency" defaultValue={deal.currency} disabled={!canEdit}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Win chance %" htmlFor="s-prob" hint="Blank = stage default"><Input id="s-prob" name="prob" type="number" min={0} max={100} defaultValue={deal.probability ?? ""} disabled={!canEdit} /></Field>
                  <Field label="Expected close" htmlFor="s-close"><Input id="s-close" name="close" type="date" defaultValue={deal.expectedCloseDate ?? ""} disabled={!canEdit} /></Field>
                </div>
                <Field label="Owner" htmlFor="s-owner">
                  <Select id="s-owner" name="owner" defaultValue={deal.owner?.id ?? ""} disabled={!canEdit}>
                    <option value="">Unassigned</option>
                    {[...owners, ...(deal.owner && !owners.some((o) => o.id === deal.owner!.id) ? [deal.owner] : [])].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                </Field>
                {canEdit && <Button type="submit" variant="primary" loading={save.pending} className="justify-self-start">Save</Button>}
              </form>
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">History</h3>
                <ol className="grid gap-2">
                  {deal.activities.map((a) => (
                    <li key={a.id} className="text-[12.5px]"><p>{a.summary}</p><p className="text-2xs text-ink-3">{a.actor ? `${a.actor} · ` : ""}{formatDateTime(a.at)}</p></li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </SheetContent>
      )}
    </Dialog>
  );
}

function StagesEditor({ board, onClose, onSaved }: { board: Board; onClose: () => void; onSaved: () => void }) {
  const [stages, setStages] = useState(board.stages.map((s) => ({ ...s, key: s.id })));
  const save = useAction(saveStagesAction, { success: "Pipeline saved", refresh: false, onSuccess: () => (onSaved(), onClose()) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Stages · ${board.pipeline.name}`} description="Win chance feeds the weighted pipeline and cash-flow forecast." className="max-w-[560px]" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={() => save.run({ pipelineId: board.pipeline.id, stages: stages.map((s) => ({ id: s.id || undefined, name: s.name, probability: s.probability, kind: s.kind })) })}>Save</Button></>}>
        <ol className="grid gap-2">
          {stages.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[1fr_80px_100px_auto] items-center gap-2">
              <Input value={s.name} onChange={(e) => setStages((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Stage name" />
              <Input type="number" min={0} max={100} value={s.probability} onChange={(e) => setStages((xs) => xs.map((x, j) => (j === i ? { ...x, probability: Number(e.target.value) } : x)))} aria-label="Win chance" className="text-right tabular" />
              <Select value={s.kind} onChange={(e) => setStages((xs) => xs.map((x, j) => (j === i ? { ...x, kind: e.target.value as Stage["kind"] } : x)))} aria-label="Stage type">
                <option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option>
              </Select>
              <button type="button" onClick={() => setStages((xs) => xs.filter((_, j) => j !== i))} className="rounded p-1 text-ink-3 hover:text-danger" aria-label="Remove stage">✕</button>
            </li>
          ))}
        </ol>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setStages((xs) => [...xs.slice(0, -2), { id: "", key: crypto.randomUUID(), name: "New stage", kind: "OPEN", probability: 50, color: null }, ...xs.slice(-2)])}><Plus className="size-3.5" /> Add stage</Button>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineBoard({ pipelines, initial, owners, canCreate, openDealId }: { pipelines: { id: string; name: string; unit: { code: string } }[]; initial: Board | null; owners: { id: string; name: string }[]; canCreate: boolean; openDealId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [board, setBoard] = useState(initial);
  const [cols, setCols] = useState<Cols>(() => (initial ? toCols(initial) : {}));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(openDealId);
  const [creating, setCreating] = useState(false);
  const [editingStages, setEditingStages] = useState(false);
  const [pendingLost, setPendingLost] = useState<{ dealId: string; stageId: string; beforeId: string | null; afterId: string | null; snapshot: Cols } | null>(null);
  const dragStart = useRef<Cols | null>(null);
  const lastDrop = useRef(0);

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setBoard(initial);
    setCols(initial ? toCols(initial) : {});
  }

  const deals = useMemo(() => new Map((board?.deals ?? []).map((d) => [d.id, d])), [board]);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: columnKeys }));

  if (!board) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Pipelines" />
        <EmptyState icon={<Workflow className="size-5" />} title="No pipeline yet" body="Each unit gets its own pipeline (Academy, FigureWeb, Telecom). Ask an admin to set one up." />
      </div>
    );
  }

  const stageOf = (id: string) => (id.startsWith("stage:") ? id.slice(6) : Object.keys(cols).find((s) => cols[s]!.includes(id)) ?? null);
  const reload = () => router.refresh();

  const commitMove = async (dealId: string, stageId: string, beforeId: string | null, afterId: string | null, snapshot: Cols, lost?: { reasonId: string; note: string }) => {
    const res = await moveDealAction({ dealId, stageId, beforeId, afterId, lostReasonId: lost?.reasonId, lostNote: lost?.note });
    if (!res.ok) {
      setCols(snapshot);
      toast({ tone: "error", title: "Couldn't move the deal", body: res.error });
      return;
    }
    setBoard((b) => b && { ...b, deals: b.deals.map((d) => (d.id === dealId ? { ...d, stageId, rank: res.data.rank, status: res.data.status } : d)) });
    if (res.data.status === "WON") toast({ tone: "success", title: "Deal won 🎉", body: "The contact is now a customer." });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = stageOf(String(active.id));
    const to = stageOf(String(over.id));
    if (!from || !to || from === to) return;
    setCols((c) => {
      const target = c[to]!.filter((x) => x !== active.id);
      const idx = String(over.id).startsWith("stage:") ? target.length : Math.max(0, target.indexOf(String(over.id)));
      return { ...c, [from]: c[from]!.filter((x) => x !== active.id), [to]: [...target.slice(0, idx), String(active.id), ...target.slice(idx)] };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    lastDrop.current = Date.now();
    const snapshot = dragStart.current!;
    dragStart.current = null;
    if (!over) return setCols(snapshot);
    const id = String(active.id);
    const stageId = stageOf(id)!;
    let next = cols;
    const overId = String(over.id);
    if (!overId.startsWith("stage:") && overId !== id && stageOf(overId) === stageId) {
      const list = cols[stageId]!;
      next = { ...cols, [stageId]: arrayMove(list, list.indexOf(id), list.indexOf(overId)) };
      setCols(next);
    }
    const list = next[stageId]!;
    const i = list.indexOf(id);
    const beforeId = list[i - 1] ?? null;
    const afterId = list[i + 1] ?? null;
    if (JSON.stringify(snapshot[stageId]) === JSON.stringify(list)) return;
    const stage = board.stages.find((s) => s.id === stageId)!;
    const deal = deals.get(id)!;
    if (stage.kind === "LOST" && deal.status !== "LOST") return setPendingLost({ dealId: id, stageId, beforeId, afterId, snapshot });
    void commitMove(id, stageId, beforeId, afterId, snapshot);
  };

  const open = board.deals.filter((d) => d.status === "OPEN" && d.currency === "NGN");
  const totalOpen = open.reduce((n, d) => n + d.value, 0);
  const weighted = open.reduce((n, d) => n + (d.value * d.probability) / 100, 0);
  const active = activeId ? deals.get(activeId) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Pipelines"
        description={`${open.length} open deals · ${money(totalOpen, "NGN", { compact: true })} in pipeline · ${money(weighted, "NGN", { compact: true })} weighted (NGN deals)`}
        actions={
          <>
            {board.canManageStages && <Button variant="secondary" onClick={() => setEditingStages(true)}><Settings2 className="size-3.5" /> Stages</Button>}
            {canCreate && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" /> New deal</Button>}
          </>
        }
      />
      <nav className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Pipelines">
        {pipelines.map((p) => (
          <Link
            key={p.id}
            href={`/customers/pipelines?p=${p.id}`}
            aria-current={p.id === board.pipeline.id ? "page" : undefined}
            className={cn("flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium", p.id === board.pipeline.id ? "border-line bg-surface shadow-card" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            <span className={cn("size-2 rounded-full", UNIT_STYLE[p.unit.code]?.dot)} />
            {p.name}
          </Link>
        ))}
      </nav>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }: DragStartEvent) => {
          dragStart.current = cols;
          setActiveId(String(active.id));
        }}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => (dragStart.current && setCols(dragStart.current), setActiveId(null))}
      >
        <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {board.stages.map((s) => {
            const ids = cols[s.id] ?? [];
            return (
              <StageColumn key={s.id} stage={s} deals={ids.map((i) => deals.get(i)!).filter(Boolean)}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-1.5">
                    {ids.map((i) => deals.get(i) && <SortableDeal key={i} d={deals.get(i)!} disabled={!board.canEdit} onOpen={(x) => Date.now() - lastDrop.current > 250 && setOpenId(x)} />)}
                  </ul>
                </SortableContext>
              </StageColumn>
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>{active ? <div className="w-[268px]"><DealCard d={active} lifted /></div> : null}</DragOverlay>
      </DndContext>

      {creating && <NewDeal board={board} onClose={() => setCreating(false)} onCreated={reload} />}
      {editingStages && <StagesEditor board={board} onClose={() => setEditingStages(false)} onSaved={reload} />}
      {pendingLost && (
        <LostDialog
          reasons={board.lostReasons}
          onCancel={() => (setCols(pendingLost.snapshot), setPendingLost(null))}
          onConfirm={(reasonId, note) => {
            const p = pendingLost;
            setPendingLost(null);
            void commitMove(p.dealId, p.stageId, p.beforeId, p.afterId, p.snapshot, { reasonId, note });
          }}
        />
      )}
      <DealSheet dealId={openId} owners={owners} canEdit={board.canEdit} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  );
}
