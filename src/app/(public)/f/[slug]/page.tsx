import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicForm } from "@/components/public/public-form";
import { publicForm } from "@/server/modules/crm/forms-service";

export const metadata: Metadata = { title: "Get in touch", robots: { index: true, follow: false } };

export default async function FormPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const form = await publicForm(slug);
  if (!form) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center px-4 py-10">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent">{form.unit.name}</p>
      <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em]">{form.name}</h1>
      <PublicForm
        form={form}
        utm={{ source: sp.utm_source, medium: sp.utm_medium, campaign: sp.utm_campaign, content: sp.utm_content }}
        refCode={sp.ref ?? null}
        turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null}
        nonce={nonce}
      />
    </main>
  );
}
