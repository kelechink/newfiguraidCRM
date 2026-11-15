import "server-only";
import { z } from "zod";
import { displayName, normalizeEmail, normalizePhone } from "@/domain/crm/contacts";
import { rankBetween } from "@/domain/shared/rank";
import { audit } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { recomputeScore } from "./contacts-service";

const id = z.string().cuid();

export const FieldDef = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "email", "phone", "textarea", "select", "number"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(60)).max(30).optional(),
});
export type FieldDef = z.infer<typeof FieldDef>;

/** Keys that map straight onto the contact record. */
const CONTACT_KEYS = new Set(["first_name", "last_name", "name", "email", "phone", "company", "budget"]);

const FormInput = z.object({
  id: id.optional(),
  unitId: id,
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, "Use 3–60 lowercase letters, numbers and dashes"),
  kind: z.enum(["form", "survey", "landing"]).default("form"),
  fields: z.array(FieldDef).min(1).max(30),
  pipelineId: id.nullable().default(null),
  stageId: id.nullable().default(null),
  consentText: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});

export async function listForms(ctx: Ctx) {
  const scope = requireScope(ctx, "crm.forms", "VIEW");
  const rows = await db.leadForm.findMany({
    where: scope === "ALL" ? {} : { unitId: { in: ctx.unitIds } },
    include: { unit: { select: { code: true, name: true } }, pipeline: { select: { name: true } }, stage: { select: { name: true } }, _count: { select: { submissions: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    kind: f.kind,
    unit: f.unit,
    fields: f.fields as FieldDef[],
    pipelineId: f.pipelineId,
    stageId: f.stageId,
    pipeline: f.pipeline?.name ?? null,
    stage: f.stage?.name ?? null,
    consentText: f.consentText,
    isActive: f.isActive,
    submissions: f._count.submissions,
  }));
}

export async function saveForm(ctx: Ctx, raw: unknown) {
  const input = FormInput.parse(raw);
  const scope = requireScope(ctx, "crm.forms", input.id ? "EDIT" : "CREATE");
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  if (!input.fields.some((f) => f.type === "email" || f.type === "phone")) throw new RuleError("Add an email or phone field so we can follow up");
  if (new Set(input.fields.map((f) => f.key)).size !== input.fields.length) throw new RuleError("Each field needs a unique key");
  if (input.pipelineId) {
    const p = await db.pipeline.findFirst({ where: { id: input.pipelineId, unitId: input.unitId } });
    if (!p) throw new RuleError("That pipeline belongs to another unit");
  }
  const clash = await db.leadForm.findFirst({ where: { slug: input.slug, NOT: input.id ? { id: input.id } : undefined } });
  if (clash) throw new RuleError("That link is taken — choose another");
  const data = { unitId: input.unitId, name: input.name, slug: input.slug, kind: input.kind, fields: input.fields, pipelineId: input.pipelineId, stageId: input.stageId, consentText: input.consentText || null, isActive: input.isActive };
  await db.$transaction(async (tx) => {
    const f = input.id ? await tx.leadForm.update({ where: { id: input.id }, data }) : await tx.leadForm.create({ data });
    await audit(tx, { actorId: ctx.userId, action: input.id ? "form.update" : "form.create", entityType: "LeadForm", entityId: f.id });
  });
}

export async function publicForm(slug: string) {
  const f = await db.leadForm.findFirst({ where: { slug, isActive: true }, include: { unit: { select: { name: true, code: true } } } });
  if (!f) return null;
  const notice = await db.policyDocument.findFirst({ where: { kind: "FORM_NOTICE", publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, select: { version: true } });
  return { name: f.name, slug: f.slug, kind: f.kind, unit: f.unit, fields: f.fields as FieldDef[], consentText: f.consentText, noticeVersion: notice?.version ?? null };
}

export interface SubmitMeta {
  /** Terms and privacy acceptance shown on the form (PRD v3 §11a): stored with the submission. */
  terms?: { termsVersion: string | null; privacyVersion: string | null; acceptedAt: string };
  ip: string | null;
  userAgent: string | null;
  utm: { source?: string; medium?: string; campaign?: string; content?: string };
  ref?: string | null;
}

/** Public submission → matched/created contact, deal in the chosen stage, consent and attribution. */
export async function submitForm(slug: string, values: Record<string, string>, consent: boolean, meta: SubmitMeta) {
  const form = await db.leadForm.findFirst({ where: { slug, isActive: true }, include: { pipeline: { include: { stages: { orderBy: { position: "asc" } } } } } });
  if (!form) throw new NotFoundError("Form");
  const fields = form.fields as FieldDef[];
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").toString().trim().slice(0, f.type === "textarea" ? 4000 : 300);
    if (f.required && !v) throw new RuleError(`${f.label} is required`);
    if (v && f.type === "email" && !normalizeEmail(v)) throw new RuleError(`${f.label} doesn't look like an email`);
    if (v && f.type === "phone" && !normalizePhone(v)) throw new RuleError(`${f.label} doesn't look like a phone number`);
    if (v && f.type === "select" && f.options && !f.options.includes(v)) throw new RuleError(`Choose a ${f.label} from the list`);
    if (v && f.type === "number" && !Number.isFinite(Number(v))) throw new RuleError(`${f.label} must be a number`);
    if (v) clean[f.key] = v;
  }
  const email = normalizeEmail(clean.email);
  const phone = normalizePhone(clean.phone);
  if (!email && !phone) throw new RuleError("Leave an email or phone number so we can reach you");

  const referrer = meta.ref ? await db.referrer.findFirst({ where: { code: meta.ref.toUpperCase(), status: "active" } }) : null;
  const sourceChannel = referrer ? "REFERRAL" : meta.utm.medium === "paid_social" || meta.utm.source === "facebook" || meta.utm.source === "instagram" ? "META_AD" : "FORM";
  const campaign = meta.utm.campaign ? await db.adCampaign.findFirst({ where: { OR: [{ name: meta.utm.campaign }, { utmLinks: { some: { utmCampaign: meta.utm.campaign } } }] } }) : null;

  const result = await db.$transaction(async (tx) => {
    let contact = await tx.contact.findFirst({
      where: { unitId: form.unitId, deletedAt: null, mergedIntoId: null, OR: [...(email ? [{ emailNormalized: email }] : []), ...(phone ? [{ phoneE164: phone }] : [])] },
    });
    const isNew = !contact;
    contact ??= await tx.contact.create({
      data: {
        unitId: form.unitId,
        firstName: clean.first_name ?? null,
        lastName: clean.last_name ?? null,
        displayName: displayName(clean.first_name, clean.last_name, clean.name ?? clean.email ?? clean.phone),
        email: clean.email ?? null,
        emailNormalized: email,
        phone: clean.phone ?? null,
        phoneE164: phone,
        whatsappId: phone?.slice(1) ?? null,
        sourceChannel,
        sourceDetail: `Form: ${form.name}`,
        formId: form.id,
        campaignId: campaign?.id ?? null,
        referralCode: referrer?.code ?? null,
        utmSource: meta.utm.source ?? null,
        utmMedium: meta.utm.medium ?? null,
        utmCampaign: meta.utm.campaign ?? null,
        budget: clean.budget && Number.isFinite(Number(clean.budget)) ? Number(clean.budget) : null,
      },
    });
    await tx.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } });
    await tx.formSubmission.create({
      data: { formId: form.id, contactId: contact.id, data: meta.terms ? { ...clean, _accepted: meta.terms } : clean, ip: meta.ip, userAgent: meta.userAgent, utm: meta.utm },
    });
    await tx.activity.create({
      data: {
        type: "FORM_SUBMITTED",
        contactId: contact.id,
        summary: `Submitted “${form.name}”`,
        data: Object.fromEntries(Object.entries(clean).filter(([k]) => !CONTACT_KEYS.has(k))),
      },
    });
    if (consent && form.consentText) {
      const notice = await tx.policyDocument.findFirst({ where: { kind: "FORM_NOTICE", publishedAt: { not: null } }, orderBy: { publishedAt: "desc" } });
      for (const channel of ["EMAIL", "WHATSAPP"] as const) {
        await tx.consent.create({ data: { contactId: contact.id, channel, granted: true, source: `form:${form.slug}`, noticeVersion: notice?.version ?? null, ip: meta.ip } });
      }
    }
    let dealId: string | null = null;
    const pipeline = form.pipeline ?? (await tx.pipeline.findFirst({ where: { unitId: form.unitId, kind: "sales" }, include: { stages: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } }));
    if (pipeline) {
      const stage = pipeline.stages.find((s) => s.id === form.stageId) ?? pipeline.stages.find((s) => s.kind === "OPEN");
      const openDeal = await tx.deal.findFirst({ where: { contactId: contact.id, pipelineId: pipeline.id, status: "OPEN", deletedAt: null } });
      if (stage && !openDeal) {
        const top = await tx.$queryRaw<{ r: string }[]>`SELECT rank AS r FROM "Deal" WHERE "stageId" = ${stage.id} ORDER BY rank COLLATE "C" ASC LIMIT 1`;
        const d = await tx.deal.create({
          data: {
            unitId: form.unitId,
            pipelineId: pipeline.id,
            stageId: stage.id,
            contactId: contact.id,
            title: `${contact.displayName} — ${form.name}`,
            rank: rankBetween(null, top[0]?.r ?? null),
            sourceChannel,
            campaignId: campaign?.id ?? null,
          },
        });
        dealId = d.id;
        if (referrer && referrer.contactId !== contact.id) {
          await tx.referral.create({ data: { referrerId: referrer.id, contactId: contact.id, dealId: d.id, status: "referred" } });
        }
      }
    }
    return { contactId: contact.id, dealId, isNew, unitId: form.unitId };
  });
  await recomputeScore(result.contactId);
  const managers = await db.user.findMany({
    where: { status: "ACTIVE", role: { key: "unit_manager" }, OR: [{ primaryUnitId: result.unitId }, { units: { some: { unitId: result.unitId } } }] },
    select: { id: true },
  });
  await notify({
    userIds: managers.map((m) => m.id),
    type: "lead.form",
    title: `New ${result.isNew ? "lead" : "submission"} from “${form.name}”`,
    body: Object.values(clean).slice(0, 3).join(" · ").slice(0, 140),
    link: `/customers/contacts/${result.contactId}`,
  });
  return result;
}
