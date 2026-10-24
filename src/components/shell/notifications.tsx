"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ago } from "@/lib/format";
import { listNotificationsAction, markNotificationsReadAction } from "@/server/modules/shell/actions";
import { cn } from "@/ui/cn";
import { useToast } from "@/ui/toast";
import { useLive } from "./live";

type Item = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await listNotificationsAction();
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useLive((e) => {
    if (e.type !== "notification") return;
    setUnread((u) => u + 1);
    toast({ tone: "success", title: String(e.title), body: e.body ? String(e.body) : undefined });
    void load();
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-[14px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-[14px] text-white tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-50 animate-pop-in rounded-xl border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:left-0 sm:top-9 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13px] font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={async () => {
                  await markNotificationsReadAction();
                  setUnread(0);
                  setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
                }}
                className="inline-flex items-center gap-1 text-2xs font-medium text-accent hover:underline"
              >
                <CheckCheck className="size-3" /> Mark all read
              </button>
            )}
          </div>
          <ul className="scrollbar-thin max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-[12.5px] text-ink-3">You&rsquo;re all caught up.</li>}
            {items.map((n) => {
              const body = (
                <div className={cn("flex gap-2.5 px-3.5 py-2.5 hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium leading-[18px]">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-2xs text-ink-3">{n.body}</p>}
                    <p className="mt-0.5 text-2xs text-ink-3">{ago(n.createdAt)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-line last:border-0">
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => {
                        setOpen(false);
                        if (!n.readAt) void markNotificationsReadAction([n.id]).then(load);
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
