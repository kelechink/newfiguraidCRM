"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./cn";

interface Toast {
  id: number;
  tone: "success" | "error";
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-[360px] animate-toast-in items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-lift"
          >
            {t.tone === "success" ? <CheckCircle2 className="mt-px size-4 shrink-0 text-success" /> : <CircleAlert className="mt-px size-4 shrink-0 text-danger" />}
            <div className="min-w-0">
              <p className={cn("text-[13px] font-medium")}>{t.title}</p>
              {t.body && <p className="mt-0.5 text-[12.5px] text-ink-3">{t.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
