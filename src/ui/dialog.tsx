"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[hsl(var(--shadow)/0.35)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-32px)] max-w-[520px] -translate-x-1/2 flex-col rounded-xl border border-line bg-surface shadow-pop data-[state=open]:animate-pop-in",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-[15px] font-semibold tracking-[-0.01em]">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[12.5px] text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-1 rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}

/** Right-hand panel for record details. */
export function SheetContent({ title, children, header }: { title: string; children: ReactNode; header?: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[hsl(var(--shadow)/0.2)] data-[state=open]:animate-fade-in" />
      <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-pop data-[state=open]:animate-slide-in">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            {header}
            <D.Title className="mt-1.5 text-[16px] font-semibold leading-6 tracking-[-0.01em]">{title}</D.Title>
            <D.Description className="sr-only">{title}</D.Description>
          </div>
          <D.Close className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
