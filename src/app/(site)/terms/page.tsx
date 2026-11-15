import type { Metadata } from "next";
import { publishedPolicy } from "@/server/modules/privacy/service";
import { Markdown } from "@/ui/markdown";

export const metadata: Metadata = { title: { absolute: "Terms and Conditions — Figuraid" } };

export default async function TermsPage() {
  const terms = await publishedPolicy("TERMS");
  return (
    <article className="wrap legal-page on-light" data-tone="light">
      <h1 className="t-h2" style={{ marginBottom: 32 }}>
        {terms?.title ?? "Terms and Conditions"}
      </h1>
      {terms ? (
        <>
          <div className="prose">
            <Markdown source={terms.body} />
          </div>
          <p className="muted t-small" style={{ marginTop: 40 }}>
            Version {terms.version}, published {new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(terms.publishedAt))}.
          </p>
        </>
      ) : (
        <p className="t-lead muted prose">Our terms are being finalised. For any question about using our services, contact our team through the request form.</p>
      )}
    </article>
  );
}
