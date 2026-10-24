import { beforeAll, describe, expect, it } from "vitest";
import { NotFoundError, RuleError, ForbiddenError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { createContact, listContacts, mergeContacts } from "@/server/modules/crm/contacts-service";
import { saveForm, submitForm } from "@/server/modules/crm/forms-service";
import { createDeal, moveDeal } from "@/server/modules/crm/pipeline-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let lead: { id: string }, staff: { id: string }, staff2: { id: string }, telLead: { id: string }, marketer: { id: string };
let pipeline: { id: string; stages: { id: string; kind: string; name: string }[] };
const rnd = () => Math.random().toString(36).slice(2, 8);
const phone = () => `080${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  lead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  staff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  staff2 = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  telLead = await makeUser({ role: "unit_manager", unitId: units.TELECOM });
  marketer = await makeUser({ role: "marketing", unitId: units.HQ });
  pipeline = await db.pipeline.create({
    data: {
      unitId: units.FIGUREWEB,
      name: `FigureWeb ${rnd()}`,
      stages: {
        create: [
          { name: "Enquiry", position: 1, probability: 10 },
          { name: "Quote sent", position: 2, probability: 40 },
          { name: "Won", position: 3, probability: 100, kind: "WON" },
          { name: "Lost", position: 4, probability: 0, kind: "LOST" },
        ],
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  await db.lostReason.upsert({ where: { label: "Price too high" }, update: {}, create: { label: "Price too high" } });
});

describe("contact scope", () => {
  it("staff see only contacts they own; leads see their unit; other units see nothing", async () => {
    const mine = await createContact(await ctxFor(staff.id), { displayName: `Mine ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    const theirs = await createContact(await ctxFor(staff2.id), { displayName: `Theirs ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    const staffView = (await listContacts(await ctxFor(staff.id), {})).rows.map((r) => r.id);
    expect(staffView).toContain(mine.id);
    expect(staffView).not.toContain(theirs.id);
    const leadView = (await listContacts(await ctxFor(lead.id), {})).rows.map((r) => r.id);
    expect(leadView).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    expect((await listContacts(await ctxFor(telLead.id), {})).rows.map((r) => r.id)).not.toContain(mine.id);
  });

  it("staff can't create contacts in another unit, and duplicates by phone are refused", async () => {
    await expect(createContact(await ctxFor(staff.id), { displayName: "X Y", phone: phone(), unitId: units.TELECOM })).rejects.toBeInstanceOf(ForbiddenError);
    const p = phone();
    await createContact(await ctxFor(lead.id), { displayName: "Ada Obi", phone: p, unitId: units.FIGUREWEB });
    await expect(createContact(await ctxFor(lead.id), { displayName: "Ada O.", phone: `+234${p.slice(1)}`, unitId: units.FIGUREWEB })).rejects.toBeInstanceOf(RuleError);
  });
});

describe("merge", () => {
  it("moves deals and history onto the survivor and retires the duplicate", async () => {
    const ctx = await ctxFor(lead.id);
    const a = await createContact(ctx, { displayName: `Keep ${rnd()}`, email: `${rnd()}@a.ng`, unitId: units.FIGUREWEB });
    const b = await createContact(ctx, { displayName: `Dup ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    await createDeal(ctx, { pipelineId: pipeline.id, title: "Hosting", contactId: b.id, value: 250000 });
    await mergeContacts(ctx, { survivorId: a.id, duplicateId: b.id });
    expect(await db.deal.count({ where: { contactId: a.id } })).toBe(1);
    const dup = await db.contact.findUniqueOrThrow({ where: { id: b.id } });
    expect(dup.mergedIntoId).toBe(a.id);
    expect((await db.contact.findUniqueOrThrow({ where: { id: a.id } })).phoneE164).toBe(dup.phoneE164);
    await expect(mergeContacts(await ctxFor(staff2.id), { survivorId: a.id, duplicateId: b.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deals", () => {
  it("lost needs a reason; won turns the contact into a customer", async () => {
    const ctx = await ctxFor(staff.id);
    const c = await createContact(ctx, { displayName: `Buyer ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    const d = await createDeal(ctx, { pipelineId: pipeline.id, title: "Email suite", contactId: c.id, value: 400000 });
    const lost = pipeline.stages.find((s) => s.kind === "LOST")!;
    const won = pipeline.stages.find((s) => s.kind === "WON")!;
    await expect(moveDeal(ctx, { dealId: d.id, stageId: lost.id })).rejects.toBeInstanceOf(RuleError);
    await moveDeal(ctx, { dealId: d.id, stageId: won.id });
    expect((await db.contact.findUniqueOrThrow({ where: { id: c.id } })).lifecycle).toBe("CUSTOMER");
    expect((await db.deal.findUniqueOrThrow({ where: { id: d.id } })).wonAt).not.toBeNull();
    await expect(moveDeal(await ctxFor(staff2.id), { dealId: d.id, stageId: lost.id, lostReasonId: (await db.lostReason.findFirstOrThrow()).id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("lead forms", () => {
  it("public submissions create a contact and deal, de-duplicate, record consent, and pay referral commission on win", async () => {
    const slug = `quote-${rnd()}`;
    await saveForm(await ctxFor(marketer.id), {
      unitId: units.FIGUREWEB,
      name: "Hosting quote",
      slug,
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "phone", label: "Phone", type: "phone", required: true },
        { key: "plan", label: "Plan", type: "select", required: false, options: ["Starter", "Business"] },
      ],
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0]!.id,
      consentText: "Send me offers by email and WhatsApp",
    });
    const refContact = await createContact(await ctxFor(lead.id), { displayName: `Referrer ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    const code = `R${rnd().toUpperCase()}`;
    await db.referrer.create({ data: { type: "CUSTOMER", contactId: refContact.id, name: "Referrer", code } });
    await db.commissionRule.create({ data: { unitId: units.FIGUREWEB, type: "PERCENT", value: 10 } });

    const p = phone();
    const meta = { ip: "1.2.3.4", userAgent: "test", utm: { source: "instagram", campaign: "oct-hosting" }, ref: code };
    const first = await submitForm(slug, { name: "Bola", phone: p, plan: "Business" }, true, meta);
    const second = await submitForm(slug, { name: "Bola A.", phone: p }, false, meta);
    expect(second.contactId).toBe(first.contactId);
    expect(second.dealId).toBeNull(); // one open deal per contact per pipeline
    expect(await db.consent.count({ where: { contactId: first.contactId, granted: true } })).toBe(2);
    await expect(submitForm(slug, { name: "No phone", phone: "" }, false, meta)).rejects.toBeInstanceOf(RuleError);
    await expect(submitForm(slug, { name: "Bad", phone: p, plan: "Enterprise" }, false, meta)).rejects.toBeInstanceOf(RuleError);

    const referral = await db.referral.findFirstOrThrow({ where: { contactId: first.contactId } });
    await db.deal.update({ where: { id: first.dealId! }, data: { value: 500000 } });
    await moveDeal(await ctxFor(lead.id), { dealId: first.dealId!, stageId: pipeline.stages.find((s) => s.kind === "WON")!.id });
    const after = await db.referral.findUniqueOrThrow({ where: { id: referral.id } });
    expect(after.status).toBe("won");
    expect(Number(after.commissionAmount)).toBe(50000);
  });
});
