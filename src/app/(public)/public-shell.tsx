import type { ReactNode } from "react";

export function PublicShell({ eyebrow, title, children, wide }: { eyebrow?: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto flex min-h-dvh flex-col justify-center px-4 py-10 ${wide ? "max-w-[760px]" : "max-w-[520px]"}`}>
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-accent"><span className="grid size-5 place-items-center rounded bg-accent text-[11px] text-white">F</span>{eyebrow ?? "Figuraid"}</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="mt-6">{children}</div>
    </main>
  );
}
