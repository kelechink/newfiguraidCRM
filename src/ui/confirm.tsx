"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

export function ConfirmButton({
  children,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={title}
        className="max-w-[420px]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">{body}</p>
      </DialogContent>
    </Dialog>
  );
}
