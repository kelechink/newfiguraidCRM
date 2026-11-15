import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { submitServiceRequest } from "@/server/modules/site/service";
import { ensureRolesAndUnits } from "./world";

const rnd = () => Math.random().toString(36).slice(2, 8);
const meta = { ip: "203.0.113.9", userAgent: "vitest", utm: { source: "linkedin" }, ref: null };

beforeAll(async () => {
  await ensureRolesAndUnits();
});

describe("website request-a-service form", () => {
  it("creates a Telecom lead and deal, records terms acceptance, and only records marketing consent when ticked", async () => {
    const email = `${rnd()}@carrier.example`;
    const r = await submitServiceRequest({ service: "Wholesale VoIP termination", destinations: "Nigeria, Ghana", volume: "2 million minutes", name: "Ama Mensah", company: `Carrier ${rnd()}`, email, marketing: false }, meta);
    const contact = await db.contact.findUniqueOrThrow({ where: { id: r.contactId }, include: { unit: true } });
    expect(contact.unit.code).toBe("TELECOM");
    expect(contact.sourceChannel).toBe("FORM");
    expect(r.dealId).not.toBeNull();
    const sub = await db.formSubmission.findFirstOrThrow({ where: { contactId: contact.id } });
    expect(sub.ip).toBe("203.0.113.9");
    expect((sub.data as { _accepted?: { acceptedAt: string } })._accepted?.acceptedAt).toBeTruthy();
    expect(await db.consent.count({ where: { contactId: contact.id } })).toBe(0);

    await submitServiceRequest({ service: "A2P SMS", name: "Ama Mensah", company: "Same", email, marketing: true }, meta);
    expect(await db.consent.count({ where: { contactId: contact.id, granted: true } })).toBeGreaterThan(0);
    expect(await db.contact.count({ where: { emailNormalized: email } })).toBe(1); // de-duplicated
  });

  it("rejects services that aren't offered and missing contact details", async () => {
    await expect(submitServiceRequest({ service: "Free money", name: "X Y", company: "Z", email: `${rnd()}@a.example` }, meta)).rejects.toThrow();
    await expect(submitServiceRequest({ service: "A2P SMS", name: "X Y", company: "Z", email: "" }, meta)).rejects.toThrow();
  });
});
