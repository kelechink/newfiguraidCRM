import Link from "next/link";
import type { ReactNode } from "react";

export function AuthFrame({ title, subtitle, children, wide }: { title: string; subtitle?: string; children?: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className={wide ? "w-full max-w-[640px]" : "w-full max-w-[360px]"}>
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]">F</span>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">Figuraid OS</span>
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
        {children}
        <p className="mt-8 text-2xs leading-4 text-ink-3">
          Use of Figuraid OS is subject to the <Link href="/privacy" className="underline hover:text-ink">privacy policy</Link> and acceptable use of company systems.
        </p>
      </div>
    </main>
  );
}
