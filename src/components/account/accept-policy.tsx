"use client";

import { useState } from "react";
import { acceptPolicyAction } from "@/server/modules/account/actions";
import { Button } from "@/ui/button";
import { useAction } from "@/ui/use-action";
import { ToastProvider } from "@/ui/toast";

function Inner({ policyId }: { policyId: string }) {
  const [checked, setChecked] = useState(false);
  const { run, pending } = useAction(acceptPolicyAction, { onSuccess: () => window.location.assign("/") });
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4 accent-[hsl(var(--accent))]" />
        I have read and accept this policy.
      </label>
      <Button variant="primary" disabled={!checked} loading={pending} onClick={() => run(policyId)}>
        Accept and continue
      </Button>
    </div>
  );
}

export function AcceptPolicy({ policyId }: { policyId: string }) {
  return (
    <ToastProvider>
      <Inner policyId={policyId} />
    </ToastProvider>
  );
}
