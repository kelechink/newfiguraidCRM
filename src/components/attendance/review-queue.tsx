"use client";

import { Check, ExternalLink, MapPin, Smartphone, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { decideDeviceAction, decideExcuseAction, reviewPunchAction } from "@/server/modules/attendance/actions";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { useAction } from "@/ui/use-action";

type Punch = {
  id: string;
  user: { id: string; name: string };
  type: string;
  at: string;
  receivedAt: string;
  wasOffline: boolean;
  office: { name: string; radiusM: number } | null;
  distanceM: number | null;
  accuracyM: number | null;
  lat: number | null;
  lng: number | null;
  ip: string | null;
  device: { label: string; status: string } | null;
  flags: { key: string; label: string }[];
  selfieUrl: string | null;
};
type Device = { id: string; user: { id: string; name: string }; label: string; userAgent: string | null; createdAt: string };
type Excuse = { id: string; user: { id: string; name: string }; date: string; status: string; minutesLate: number; reason: string };

export function ReviewQueue({ punches, devices, excuses }: { punches: Punch[]; devices: Device[]; excuses: Excuse[] }) {
  const review = useAction(reviewPunchAction, { success: "Saved" });
  const device = useAction(decideDeviceAction, { success: "Saved" });
  const excuse = useAction(decideExcuseAction, { success: "Saved" });

  if (!punches.length && !devices.length && !excuses.length) {
    return <EmptyState icon={<Check className="size-5" />} title="Nothing to review" body="Flagged clock-ins, new phones and excuses for your team show up here." />;
  }

  return (
    <div className="grid gap-5">
      {excuses.length > 0 && (
        <Card padded={false}>
          <div className="p-4 pb-2">
            <CardHeader title="Excuses" description="Accepting removes the lateness or absence deduction for that day." />
          </div>
          <ul className="divide-y divide-line">
            {excuses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar id={e.user.id} name={e.user.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {e.user.name} · {e.date} · {e.status === "LATE" ? `${e.minutesLate} min late` : e.status.toLowerCase()}
                  </p>
                  <p className="text-[12.5px] text-ink-2">&ldquo;{e.reason}&rdquo;</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => excuse.run({ excuseId: e.id, approve: false })} disabled={excuse.pending}>
                  Decline
                </Button>
                <Button size="sm" variant="primary" onClick={() => excuse.run({ excuseId: e.id, approve: true })} disabled={excuse.pending}>
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {devices.length > 0 && (
        <Card padded={false}>
          <div className="p-4 pb-2">
            <CardHeader title="New phones" description="Each person clocks in from one phone. Approving a new one retires the old." />
          </div>
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Smartphone className="size-4 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {d.user.name} · {d.label}
                  </p>
                  <p className="truncate text-2xs text-ink-3">First seen {formatDateTime(d.createdAt)}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => device.run({ deviceId: d.id, approve: false })} disabled={device.pending}>
                  Reject
                </Button>
                <Button size="sm" variant="primary" onClick={() => device.run({ deviceId: d.id, approve: true })} disabled={device.pending}>
                  Approve phone
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {punches.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {punches.map((p) => (
            <Card key={p.id}>
              <div className="flex gap-4">
                {p.selfieUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.selfieUrl} alt={`Selfie from ${p.user.name}`} className="size-24 shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                  <div className="flex size-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-center text-2xs text-ink-3">No selfie</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{p.user.name}</p>
                  <p className="text-[12.5px] text-ink-2">
                    Clocked {p.type === "IN" ? "in" : "out"} {formatDateTime(p.at)}
                    {p.wasOffline && <Badge className="ml-1.5">Offline sync</Badge>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.flags.map((f) => (
                      <Badge key={f.key} tone={f.key === "remote" ? "neutral" : "warning"}>
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-[12px]">
                <dt className="text-ink-3">Distance</dt>
                <dd className="tabular">{p.distanceM !== null ? `${Math.round(p.distanceM)} m from ${p.office?.name ?? "office"} (limit ${p.office?.radiusM ?? "—"} m)` : "—"}</dd>
                <dt className="text-ink-3">GPS accuracy</dt>
                <dd className="tabular">{p.accuracyM !== null ? `±${Math.round(p.accuracyM)} m` : "—"}</dd>
                <dt className="text-ink-3">Phone</dt>
                <dd>{p.device ? `${p.device.label}${p.device.status !== "APPROVED" ? " (not approved)" : ""}` : "—"}</dd>
                <dt className="text-ink-3">IP</dt>
                <dd className="font-mono">{p.ip ?? "—"}</dd>
              </dl>
              <div className="mt-3 flex items-center gap-2">
                {p.lat !== null && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                  >
                    <MapPin className="size-3" /> View on map <ExternalLink className="size-3" />
                  </a>
                )}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => review.run({ punchId: p.id, decision: "REJECTED" })} disabled={review.pending}>
                    <X className="size-3.5" /> Reject
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => review.run({ punchId: p.id, decision: "APPROVED" })} disabled={review.pending}>
                    <Check className="size-3.5" /> Accept
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
