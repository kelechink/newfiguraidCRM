"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action";
import { useToast } from "./toast";

/**
 * Calls a server action with the house conventions: toast on success/failure,
 * field errors for forms, router refresh, and a redirect to re-auth when a
 * finance/payroll action needs a fresh password.
 */
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>, opts: { success?: string | ((o: O) => string); refresh?: boolean; onSuccess?: (o: O) => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = (input: I) =>
    new Promise<O | null>((resolve) =>
      start(async () => {
        const res = await action(input);
        if (res.ok) {
          setErrors({});
          const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success;
          if (msg) toast({ tone: "success", title: msg });
          opts.onSuccess?.(res.data);
          if (opts.refresh !== false) router.refresh();
          resolve(res.data);
        } else {
          setErrors(res.fields ?? {});
          toast({ tone: "error", title: res.error });
          if (res.reauth) router.push(`/account/reauth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          resolve(null);
        }
      }),
    );
  /** For `<form action={…}>`: map the FormData to the action's input. */
  const formAction = (map: (f: FormData) => I) => (f: FormData) => {
    void run(map(f));
  };
  return { run, formAction, pending, errors };
}
