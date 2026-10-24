"use client";

import { CheckCircle2, Megaphone, Pin } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { acknowledgeAction, publishAnnouncementAction } from "@/server/modules/messaging/actions";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { EmptyState } from "@/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Markdown } from "@/ui/markdown";
import { PageHeader } from "@/ui/page-header";
import { useAction } from "@/ui/use-action";

type Item = {
  id: string;
  title: string;
  body: string;
  requiresAck: boolean;
  unitId: string | null;
  publishedBy: { id: string; name: string };
  publishedAt: string;
  pinned: boolean;
  ackedByMe: boolean;
  ackCount: number | null;
  audience: number | null;
};

export function Announcements({ items, canPublish, companyWide, units }: { items: Item[]; canPublish: boolean; companyWide: boolean; units: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const ack = useAction(acknowledgeAction, { success: "Acknowledged" });
  const publish = useAction(publishAnnouncementAction, { success: "Announcement sent", onSuccess: () => setOpen(false) });
  const unitName = (id: string | null) => (id ? (units.find((u) => u.id === id)?.name ?? "Unit") : "Everyone");

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <PageHeader
        title="Announcements"
        description="Company and unit news. Some need your acknowledgement."
        actions={canPublish && <Button variant="primary" onClick={() => setOpen(true)}><Megaphone className="size-3.5" /> New announcement</Button>}
      />
      {items.length === 0 && <EmptyState icon={<Megaphone className="size-5" />} title="No announcements yet" body="Company-wide and unit announcements appear here." />}
      {items.map((a) => (
        <Card key={a.id} className={a.requiresAck && !a.ackedByMe ? "border-accent/40" : undefined}>
          <div className="flex items-start gap-3">
            <Avatar id={a.publishedBy.id} name={a.publishedBy.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">{a.title}</h2>
                {a.pinned && <Badge icon={<Pin className="size-3" />}>Pinned</Badge>}
                <Badge>{unitName(a.unitId)}</Badge>
              </div>
              <p className="text-2xs text-ink-3">{a.publishedBy.name} · {formatDateTime(a.publishedAt)}</p>
              <Markdown source={a.body} className="mt-2" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {a.requiresAck &&
                  (a.ackedByMe ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success"><CheckCircle2 className="size-3.5" /> You acknowledged this</span>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => ack.run(a.id)} loading={ack.pending}>I&rsquo;ve read this</Button>
                  ))}
                {a.ackCount !== null && a.requiresAck && (
                  <span className="text-2xs text-ink-3 tabular">{a.ackCount} of {a.audience} acknowledged</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="New announcement"
          description="Everyone in the audience is notified in-app and by email."
          className="max-w-[600px]"
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="ann" loading={publish.pending}>Publish</Button></>}
        >
          <form id="ann" className="grid gap-4" action={publish.formAction((f) => ({ title: f.get("title"), body: f.get("body"), unitId: f.get("unitId") || null, requiresAck: f.get("ack") === "on", pinDays: Number(f.get("pin") ?? 7) }))}>
            <Field label="Title" htmlFor="a-title" error={publish.errors.title}><Input id="a-title" name="title" required maxLength={140} /></Field>
            <Field label="Message" htmlFor="a-body" hint="Supports **bold**, lists with “-”, and headings with “#”." error={publish.errors.body}><Textarea id="a-body" name="body" required className="min-h-[140px]" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audience" htmlFor="a-unit">
                <Select id="a-unit" name="unitId" defaultValue={companyWide ? "" : units[0]?.id}>
                  {companyWide && <option value="">Everyone</option>}
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              <Field label="Pin for" htmlFor="a-pin">
                <Select id="a-pin" name="pin" defaultValue="7"><option value="0">Don&rsquo;t pin</option><option value="3">3 days</option><option value="7">1 week</option><option value="30">1 month</option></Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="ack" defaultChecked className="size-3.5 accent-[hsl(var(--accent))]" /> Require everyone to acknowledge</label>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
