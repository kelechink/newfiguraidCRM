import "server-only";
import { z } from "zod";
import { REQUESTABLE } from "@/components/site/content";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { submitForm, type FieldDef } from "@/server/modules/crm/forms-service";
import { publishedPolicy } from "@/server/modules/privacy/service";

export const SERVICE_FORM_SLUG = "request-a-service";

const FIELDS: FieldDef[] = [
  { key: "service", label: "Service", type: "select", required: true, options: REQUESTABLE },
  { key: "destinations", label: "Destinations or countries", type: "text", required: false },
  { key: "volume", label: "Expected monthly volume", type: "text", required: false },
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "company", label: "Company", type: "text", required: true },
  { key: "email", label: "Work email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "phone", required: false },
  { key: "message", label: "Anything else", type: "textarea", required: false },
];

/** The website's request form, wired to the Telecom sales pipeline (created on first use). */
async function ensureServiceForm() {
  const existing = await db.leadForm.findUnique({ where: { slug: SERVICE_FORM_SLUG } });
  if (existing) {
    // keep the service list in step with the website content
    if (JSON.stringify(existing.fields) !== JSON.stringify(FIELDS)) await db.leadForm.update({ where: { id: existing.id }, data: { fields: FIELDS } });
    return existing;
  }
  const unit = await db.businessUnit.findUniqueOrThrow({ where: { code: "TELECOM" } });
  const pipeline =
    (await db.pipeline.findFirst({ where: { unitId: unit.id, kind: "sales" }, include: { stages: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } })) ??
    (await db.pipeline.create({
      data: {
        unitId: unit.id,
        name: "Telecom sales",
        stages: {
          create: [
            { name: "New request", position: 1, probability: 10 },
            { name: "Qualified", position: 2, probability: 25 },
            { name: "Rates sent", position: 3, probability: 40 },
            { name: "Testing", position: 4, probability: 65 },
            { name: "Won", position: 5, probability: 100, kind: "WON" },
            { name: "Lost", position: 6, probability: 0, kind: "LOST" },
          ],
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    }));
  return db.leadForm.create({
    data: { unitId: unit.id, name: "Website: request a service", slug: SERVICE_FORM_SLUG, fields: FIELDS, pipelineId: pipeline.id, stageId: pipeline.stages[0]?.id ?? null, consentText: "Send me product updates and route offers by email." },
  });
}

export const ServiceRequest = z.object({
  service: z.string().max(80),
  destinations: z.string().max(300).optional().default(""),
  volume: z.string().max(120).optional().default(""),
  name: z.string().max(120),
  company: z.string().max(160),
  email: z.string().max(254),
  phone: z.string().max(40).optional().default(""),
  message: z.string().max(4000).optional().default(""),
  marketing: z.boolean().default(false),
});

export async function submitServiceRequest(raw: unknown, meta: { ip: string | null; userAgent: string | null; utm: Record<string, string | undefined>; ref: string | null }) {
  const input = ServiceRequest.parse(raw);
  await ensureServiceForm();
  const [terms, privacy] = await Promise.all([publishedPolicy("TERMS"), publishedPolicy("PUBLIC_PRIVACY")]);
  const { marketing, ...values } = input;
  const result = await submitForm(SERVICE_FORM_SLUG, values, marketing, {
    ...meta,
    terms: { termsVersion: terms?.version ?? null, privacyVersion: privacy?.version ?? null, acceptedAt: new Date().toISOString() },
  });
  // acknowledgement to the requester (goes through the email outbox; never blocks the request)
  const lines = [`Service: ${values.service}`, values.destinations && `Destinations: ${values.destinations}`, values.volume && `Expected monthly volume: ${values.volume}`, values.message && `Notes: ${values.message}`].filter(Boolean).join("\n");
  await sendEmail({ to: values.email, subject: "We've received your request — Figuraid", text: `Hello ${values.name.split(/\s+/)[0]},\n\nThanks for contacting Figuraid. Our telecom team will reply with rates and next steps.\n\nWhat you sent:\n${lines}\n\nFiguraid Ltd, Kano House, 72 Ralph Shodeinde Street, Central Business District, Abuja`, contactId: result.contactId, template: "site_request_ack" }).catch((e) => console.error("[site-request] ack email", e));
  return result;
}
