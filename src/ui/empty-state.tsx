import type { ReactNode } from "react";

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong/70 bg-surface/50 px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 shadow-card">{icon}</div>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
