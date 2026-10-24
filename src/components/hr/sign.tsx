"use client";

import { Download, PenLine } from "lucide-react";
import { useState } from "react";
import { signDocumentAction, signedPdfAction } from "@/server/modules/hr/actions";
import { Button } from "@/ui/button";
import { downloadBase64 } from "@/ui/download";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function SignPanel({ documentId, contentHash, name, role }: { documentId: string; contentHash: string; name: string; role: string }) {
  const [agree, setAgree] = useState(false);
  const sign = useAction(signDocumentAction, { success: (r) => (r.activated ? "Signed — your account is now fully active" : "Signed") });
  return (
    <form className="grid gap-4" action={sign.formAction((f) => ({ documentId, contentHash, typedName: f.get("typed"), agree: f.get("agree") === "on" ? true : undefined }))}>
      <Field label={role === "COMPANY" ? "Countersign as Figuraid Ltd — type your full name" : "Type your full name to sign"} htmlFor="sg-name" hint={`Exactly as on your account: ${name}`} error={sign.errors.typedName}>
        <Input id="sg-name" name="typed" required autoComplete="name" className="font-[cursive] text-[16px]" />
      </Field>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[hsl(var(--accent))]" />
        <span>I have read this document in full and agree to be bound by it. I understand my typed name is my electronic signature, recorded with the time, my IP address and device.</span>
      </label>
      <Button type="submit" variant="primary" disabled={!agree} loading={sign.pending} className="w-fit"><PenLine className="size-3.5" /> Sign document</Button>
    </form>
  );
}

export function SignedPdfButton({ documentId }: { documentId: string }) {
  const pdf = useAction(signedPdfAction, { refresh: false, onSuccess: (r) => downloadBase64(r.filename, r.base64) });
  return <Button variant="secondary" onClick={() => pdf.run(documentId)} loading={pdf.pending}><Download className="size-3.5" /> Download PDF</Button>;
}
