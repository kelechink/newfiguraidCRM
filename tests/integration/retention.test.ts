import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createContact } from "@/server/modules/crm/contacts-service";
import { runRetention } from "@/server/modules/privacy/service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let lead: { id: string }, units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
const rnd = () => Math.random().toString(36).slice(2, 8);
const old = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  lead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  await db.retentionRule.upsert({ where: { entity: "contact_lead" }, update: { afterDays: 90, action: "delete", isActive: true }, create: { entity: "contact_lead", afterDays: 90, action: "delete" } });
});

describe("lead retention", () => {
  it("deletes leads not followed up for 90 days, keeps active leads and customers, and warns owners at day 83", async () => {
    const ctx = await ctxFor(lead.id);
    const mk = async (name: string, lastActivityDays: number | null, lifecycle: "LEAD" | "CUSTOMER" = "LEAD") => {
      const { id } = await createContact(ctx, { displayName: `${name} ${rnd()}`, email: `${rnd()}@lead.ng`, unitId: units.FIGUREWEB, ownerId: lead.id });
      await db.contact.update({ where: { id }, data: { lifecycle, createdAt: old(200), lastActivityAt: lastActivityDays == null ? null : old(lastActivityDays) } });
      return id;
    };
    const stale = await mk("Stale", 95);
    const neverTouched = await mk("Never touched", null);
    const fresh = await mk("Fresh", 10);
    const customer = await mk("Customer", 300, "CUSTOMER");
    const warn = await mk("Almost", 83.5);
    await db.consent.create({ data: { contactId: stale, channel: "EMAIL", granted: true, source: "form" } });
    await db.activity.create({ data: { type: "NOTE", contactId: stale, summary: "Called, no answer", occurredAt: old(95) } });

    await runRetention();
    expect(await db.contact.findUnique({ where: { id: stale } })).toBeNull();
    expect(await db.contact.findUnique({ where: { id: neverTouched } })).toBeNull();
    expect(await db.consent.count({ where: { contactId: stale } })).toBe(0);
    expect(await db.contact.findUnique({ where: { id: fresh } })).not.toBeNull();
    expect(await db.contact.findUnique({ where: { id: customer } })).not.toBeNull();
    expect(await db.contact.findUnique({ where: { id: warn } })).not.toBeNull();
    expect(await db.notification.count({ where: { userId: lead.id, type: "retention.leads" } })).toBeGreaterThan(0);
  });
});
