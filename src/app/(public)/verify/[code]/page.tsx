import { BadgeCheck, CircleX, History } from "lucide-react";
import type { Metadata } from "next";
import { PublicShell } from "../../public-shell";
import { verifyCertificate } from "@/server/modules/academy/service";
import { rateLimit, requestIp } from "@/server/ratelimit";

export const metadata: Metadata = { title: "Verify a certificate", robots: { index: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const limited = !rateLimit(`verify:${await requestIp()}`, 30, 15 * 60_000);
  const c = limited ? null : await verifyCertificate(decodeURIComponent(code));
  return (
    <PublicShell eyebrow="Figure Academy" title="Certificate verification">
      {limited ? (
        <p className="text-[13.5px] text-ink-2">Too many checks from your network. Please try again in a few minutes.</p>
      ) : !c ? (
        <div className="rounded-xl border border-line bg-surface p-5 text-[13.5px]">
          <p className="flex items-center gap-2 font-semibold"><CircleX className="size-5 text-danger" /> No certificate with that ID</p>
          <p className="mt-2 text-ink-2">Check the ID printed on the certificate (for example FA-7KQ2-M9XD-P4TA). Letters O, I and L are never used.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5 text-[13.5px]">
          {c.status === "VALID" && <p className="flex items-center gap-2 font-semibold text-success"><BadgeCheck className="size-5" /> Valid certificate</p>}
          {c.status === "REVOKED" && <p className="flex items-center gap-2 font-semibold text-danger"><CircleX className="size-5" /> This certificate has been revoked</p>}
          {c.status === "SUPERSEDED" && <p className="flex items-center gap-2 font-semibold text-warning"><History className="size-5" /> Replaced by a reissued certificate</p>}
          <dl className="mt-4 grid gap-2">
            {c.recipientName && <div className="flex justify-between gap-3"><dt className="text-ink-3">Awarded to</dt><dd className="font-medium">{c.recipientName}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Course</dt><dd className="text-right">{c.courseTitle}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Cohort</dt><dd className="text-right">{c.cohortName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Issued</dt><dd>{new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(c.issuedOn))}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Certificate ID</dt><dd className="font-mono">{c.code}</dd></div>
          </dl>
        </div>
      )}
    </PublicShell>
  );
}
