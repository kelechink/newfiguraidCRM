import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

/** Dense, Linear-style table. Wrap in a Card with padded={false}. Scrolls sideways on phones. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-[13px]", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-surface-2/50 text-left">{children}</thead>;
}

export function Th({ className, children, align, ...p }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" | "center" }) {
  return (
    <th
      className={cn("h-9 whitespace-nowrap px-3 text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-3 first:pl-4 last:pr-4", align === "right" && "text-right", align === "center" && "text-center", className)}
      {...p}
    >
      {children}
    </th>
  );
}

export function Tr({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  return (
    <tr className={cn("border-b border-line last:border-0 transition-colors", href && "hover:bg-surface-2/60", className)} data-href={href}>
      {children}
    </tr>
  );
}

export function Td({ className, children, align, muted, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" | "center"; muted?: boolean }) {
  return (
    <td
      className={cn("h-11 px-3 align-middle first:pl-4 last:pr-4", align === "right" && "text-right tabular", align === "center" && "text-center", muted && "text-ink-3", className)}
      {...p}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-[13px] text-ink-3">
        {children}
      </td>
    </tr>
  );
}
