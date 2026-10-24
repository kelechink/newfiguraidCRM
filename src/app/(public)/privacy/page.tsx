import type { Metadata } from "next";
import Link from "next/link";
import { publishedPolicy } from "@/server/modules/privacy/service";
import { getSetting } from "@/server/modules/settings/service";
import { Markdown } from "@/ui/markdown";
import { PublicShell } from "../public-shell";

export const metadata: Metadata = { title: "Privacy notice" };

export default async function PrivacyPage() {
  const [p, dpo] = await Promise.all([publishedPolicy("PUBLIC_PRIVACY"), getSetting("dpo.contact")]);
  return (
    <PublicShell title={p?.title ?? "Privacy notice"} wide>
      {p ? <Markdown source={p.body} className="text-[14px] leading-relaxed" /> : <p className="text-[13.5px] text-ink-2">Our privacy notice is being updated. Contact {dpo} with any question about your data.</p>}
      <div className="mt-8 rounded-xl border border-line bg-surface p-4 text-[13.5px]">
        <p className="font-medium">Your rights under the Nigeria Data Protection Act 2023</p>
        <p className="mt-1 text-ink-2">You can ask for a copy of your data, its correction or deletion, or object to marketing. <Link href="/privacy/request" className="text-accent underline">Make a request</Link> or email {dpo}.</p>
        {p && <p className="mt-2 text-2xs text-ink-3">Version {p.version} · published {new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(p.publishedAt))}</p>}
      </div>
    </PublicShell>
  );
}
