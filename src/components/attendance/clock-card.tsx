"use client";

import { Camera, CheckCircle2, CloudOff, Loader2, LogIn, LogOut, MapPin, RefreshCw, ShieldAlert, Smartphone, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { clockStateAction, punchAction } from "@/server/modules/attendance/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { useToast } from "@/ui/toast";

type State = NonNullable<Extract<Awaited<ReturnType<typeof clockStateAction>>, { ok: true }>["data"]>;
type Fix = { lat: number; lng: number; accuracy: number } | null;
type Queued = { type: "IN" | "OUT"; deviceTime: string; fix: Fix; selfie: string | null };

const KEY = "fos_device_key";
const QUEUE = "fos_punch_queue";

/** Per-phone random key kept in this browser; the server only ever sees its SHA-256. */
async function deviceFingerprint(): Promise<string> {
  let key = localStorage.getItem(KEY);
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, key);
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? (/; ([^;)]+) Build/.exec(ua)?.[1] ?? "Android phone") : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "Device";
}

function getFix(): Promise<Fix> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

async function toForm(q: Queued, fingerprint: string, offline: boolean): Promise<FormData> {
  const f = new FormData();
  f.set("type", q.type);
  f.set("deviceTime", q.deviceTime);
  f.set("fingerprint", fingerprint);
  f.set("wasOffline", String(offline));
  f.set("deviceLabel", deviceLabel());
  if (q.fix) {
    f.set("lat", String(q.fix.lat));
    f.set("lng", String(q.fix.lng));
    f.set("accuracy", String(q.fix.accuracy));
  }
  if (q.selfie) f.set("selfie", await (await fetch(q.selfie)).blob(), "selfie.jpg");
  return f;
}

function SelfieCapture({ onCapture }: { onCapture: (dataUrl: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      .then((s) => {
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Camera blocked. Allow camera access for this site, or continue without a selfie (it will be flagged)."));
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const take = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas");
    c.width = c.height = 480;
    const g = c.getContext("2d")!;
    g.translate(480, 0);
    g.scale(-1, 1); // mirror, like the preview
    g.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
    const url = c.toDataURL("image/jpeg", 0.82);
    setShot(url);
    onCapture(url);
  };

  return (
    <div className="grid gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-surface-3">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="Your selfie" className="size-full object-cover" />
        ) : (
          <video ref={video} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
        )}
        {error && <p className="absolute inset-0 flex items-center p-6 text-center text-[12.5px] text-ink-2">{error}</p>}
      </div>
      <div className="flex justify-center gap-2">
        {shot ? (
          <Button
            variant="secondary"
            onClick={() => {
              setShot(null);
              onCapture(null);
            }}
          >
            <RefreshCw className="size-3.5" /> Retake
          </Button>
        ) : (
          <Button variant="secondary" onClick={take} disabled={!!error}>
            <Camera className="size-3.5" /> Take selfie
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClockCard() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [flow, setFlow] = useState<"IN" | "OUT" | null>(null);
  const [fix, setFix] = useState<Fix | undefined>(undefined);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [result, setResult] = useState<{ needsReview: boolean; flags: { key: string; label: string }[]; type: string; minutesLate: number } | null>(null);

  const load = useCallback(async (fingerprint: string) => {
    const res = await clockStateAction(fingerprint);
    if (res.ok) setState(res.data);
  }, []);

  const sync = useCallback(
    async (fingerprint: string) => {
      const q = readQueue();
      if (!q.length || !navigator.onLine) return setQueued(q.length);
      const left: Queued[] = [];
      for (const item of q) {
        const res = await punchAction(await toForm(item, fingerprint, true)).catch(() => null);
        if (!res) left.push(item);
        else if (!res.ok) toast({ tone: "error", title: "An offline clock-in couldn't be synced", body: res.error });
      }
      localStorage.setItem(QUEUE, JSON.stringify(left));
      setQueued(left.length);
      if (left.length < q.length) {
        toast({ tone: "success", title: "Offline clock-ins synced" });
        await load(fingerprint);
      }
    },
    [load, toast],
  );

  useEffect(() => {
    void deviceFingerprint().then((f) => {
      setFp(f);
      void load(f);
      void sync(f);
    });
    const on = () => fp && void sync(fp);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (type: "IN" | "OUT") => {
    setFlow(type);
    setSelfie(null);
    setResult(null);
    setFix(undefined);
    setFix(await getFix());
  };

  const submit = async () => {
    if (!fp || !flow) return;
    setBusy(true);
    const item: Queued = { type: flow, deviceTime: new Date().toISOString(), fix: fix ?? null, selfie };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const res = await punchAction(await toForm(item, fp, false));
      if (res.ok) {
        setResult(res.data);
        await load(fp);
      } else {
        toast({ tone: "error", title: res.error });
        setFlow(null);
      }
    } catch {
      localStorage.setItem(QUEUE, JSON.stringify([...readQueue(), item]));
      setQueued(readQueue().length);
      toast({ tone: "success", title: "Saved on this phone", body: "No connection — it will sync with the original time when you're back online." });
      setFlow(null);
    } finally {
      setBusy(false);
    }
  };

  const desktop = typeof navigator !== "undefined" && !/Android|iPhone|iPad/.test(navigator.userAgent);
  const last = state?.punches.filter((p) => p.reviewStatus !== "REJECTED").at(-1);

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        {!state ? (
          <div className="flex h-48 items-center justify-center text-ink-3">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-ink-3">{new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
                <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">{state.clockedIn ? "You're clocked in" : last ? "You're clocked out" : state.isWorkingDay ? "Not clocked in yet" : "Day off"}</p>
                <p className="mt-0.5 text-[13px] text-ink-3">
                  {last ? `${last.type === "IN" ? "In" : "Out"} at ${formatTime(new Date(last.at))}` : `Resumption ${state.schedule.resumeTime} · ${state.schedule.graceMinutes} min grace`}
                  {state.office && ` · ${state.office.name}`}
                </p>
              </div>
              {state.status === "LATE" && <Badge tone="warning">Late {state.minutesLate} min</Badge>}
              {state.status === "PRESENT" && <Badge tone="success">On time</Badge>}
            </div>

            <Button
              variant={state.clockedIn ? "secondary" : "primary"}
              className="mt-6 h-12 w-full text-[15px]"
              onClick={() => start(state.clockedIn ? "OUT" : "IN")}
            >
              {state.clockedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
              {state.clockedIn ? "Clock out" : "Clock in"}
            </Button>

            {state.device === "PENDING" && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[12.5px] text-ink-2">
                <Smartphone className="mt-px size-3.5 shrink-0 text-warning" /> This phone is waiting for your manager&rsquo;s approval. You can still clock in — it will be flagged until approved.
              </p>
            )}
            {state.device === "OTHER_APPROVED" && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[12.5px] text-ink-2">
                <Smartphone className="mt-px size-3.5 shrink-0 text-warning" /> This isn&rsquo;t your registered phone. Clocking in here asks your manager to approve it as your new phone.
              </p>
            )}
            {desktop && (
              <p className="mt-3 text-2xs text-ink-3">Laptop GPS is often inaccurate. Clock in from your phone for the best result.</p>
            )}
            {queued > 0 && (
              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-2">
                <CloudOff className="size-3.5 text-ink-3" /> {queued} clock-in{queued === 1 ? "" : "s"} saved offline, waiting to sync.
              </p>
            )}

            {state.punches.length > 0 && (
              <ol className="mt-5 grid gap-1.5 border-t border-line pt-4">
                {state.punches.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-[12.5px]">
                    <span className={cn("size-1.5 rounded-full", p.type === "IN" ? "bg-success" : "bg-ink-3")} />
                    <span className="w-16 tabular">{formatTime(new Date(p.at))}</span>
                    <span className="text-ink-2">{p.type === "IN" ? "Clocked in" : "Clocked out"}</span>
                    {p.reviewStatus === "PENDING" && <Badge tone="warning" className="ml-auto">Under review</Badge>}
                    {p.reviewStatus === "REJECTED" && <Badge tone="danger" className="ml-auto">Rejected</Badge>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>

      <Dialog open={!!flow} onOpenChange={(o) => !o && !busy && setFlow(null)}>
        {flow && (
          <DialogContent
            title={result ? (result.needsReview ? "Recorded — flagged for review" : `Clocked ${flow === "IN" ? "in" : "out"}`) : flow === "IN" ? "Clock in" : "Clock out"}
            description={result ? undefined : "Your location and a selfie are checked against the office and your registered phone."}
            className="max-w-[420px]"
            footer={
              result ? (
                <Button variant="primary" onClick={() => setFlow(null)}>
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setFlow(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={submit} loading={busy} disabled={fix === undefined}>
                    {selfie ? "Confirm" : "Confirm without selfie"}
                  </Button>
                </>
              )
            }
          >
            {result ? (
              <div className="grid gap-3 text-[13px]">
                {result.needsReview ? (
                  <>
                    <p className="flex items-start gap-2 text-ink-2">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" /> Your clock-{flow === "IN" ? "in" : "out"} is saved, and your manager will review it because:
                    </p>
                    <ul className="list-disc pl-10 text-ink-2">
                      {result.flags.map((f) => (
                        <li key={f.key}>{f.label}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-ink-2">
                    <CheckCircle2 className="size-4 text-success" /> All checks passed.
                  </p>
                )}
                {result.minutesLate > 0 && flow === "IN" && (
                  <p className="flex items-center gap-2 text-warning">
                    <TriangleAlert className="size-4" /> {result.minutesLate} minutes late. If there was a good reason, submit an excuse from My month.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[12.5px]">
                  <MapPin className="size-3.5 text-ink-3" />
                  {fix === undefined ? (
                    <span className="flex items-center gap-1.5 text-ink-3">
                      <Loader2 className="size-3 animate-spin" /> Getting your location…
                    </span>
                  ) : fix ? (
                    <span>Location captured · accurate to {Math.round(fix.accuracy)} m</span>
                  ) : (
                    <span className="text-warning">Location unavailable — allow location access. You can continue; it will be flagged.</span>
                  )}
                </div>
                <SelfieCapture onCapture={setSelfie} />
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
