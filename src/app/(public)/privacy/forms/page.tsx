import type { Metadata } from "next";
import Link from "next/link";
import { publishedPolicy } from "@/server/modules/privacy/service";
import { Markdown } from "@/ui/markdown";
import { PublicShell } from "../../public-shell";

export const metadata: Metadata = { title: "How we use form details" };

export default async function FormNoticePage() {
  const p = await publishedPolicy("FORM_NOTICE");
  return (
    <PublicShell title={p?.title ?? "How we use the details you send us"} wide>
      {p ? <Markdown source={p.body} className="text-[14px] leading-relaxed" /> : <p className="text-[13.5px] text-ink-2">We use your details to reply to your enquiry and, only if you ticked the box, to send you updates. You can opt out at any time. See the full <Link href="/privacy" className="text-accent underline">privacy notice</Link>.</p>}
    </PublicShell>
  );
}
