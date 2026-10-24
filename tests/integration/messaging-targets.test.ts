import { beforeAll, describe, expect, it } from "vitest";
import { localDate } from "@/domain/sop/schedule";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { createGroup, listMessages, messageToTask, openDirect, publishAnnouncement, sendMessage } from "@/server/modules/messaging/service";
import { measure, setTarget, weekStartOf } from "@/server/modules/targets/service";
import { moveTask } from "@/server/modules/tasks/service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let founder: { id: string }, lead: { id: string }, a: { id: string }, b: { id: string }, outsider: { id: string };

const text = (channelId: string, body: string, extra: Record<string, string | string[]> = {}) => {
  const f = new FormData();
  f.set("channelId", channelId);
  f.set("body", body);
  for (const [k, v] of Object.entries(extra)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  founder = await makeUser({ role: "super_admin", unitId: units.HQ });
  lead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  a = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  b = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  outsider = await makeUser({ role: "staff", unitId: units.TELECOM });
});

describe("messaging privacy", () => {
  it("DMs are private to the two people; the Super Admin can read for audit, and that read is logged", async () => {
    const { id } = await openDirect(await ctxFor(a.id), b.id);
    await sendMessage(await ctxFor(a.id), text(id, "client wants a discount"));
    await expect(listMessages(await ctxFor(outsider.id), { channelId: id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(await ctxFor(outsider.id), text(id, "hi"))).rejects.toBeInstanceOf(NotFoundError);
    const before = await db.auditLog.count({ where: { action: "chat.audit_view", entityId: id } });
    const thread = await listMessages(await ctxFor(founder.id), { channelId: id });
    expect(thread.messages.map((m) => m.body)).toContain("client wants a discount");
    expect(await db.auditLog.count({ where: { action: "chat.audit_view", entityId: id } })).toBe(before + 1);
  });

  it("mentions only notify members of the conversation", async () => {
    const { id } = await createGroup(await ctxFor(a.id), { name: "Renewals", memberIds: [b.id] });
    await sendMessage(await ctxFor(a.id), text(id, "can you check this?", { mentionIds: [b.id, outsider.id] }));
    const msg = await db.chatMessage.findFirstOrThrow({ where: { channelId: id }, include: { mentions: true } });
    expect(msg.mentions.map((m) => m.userId)).toEqual([b.id]);
  });
});

describe("message → task", () => {
  it("staff can't assign work from chat; a lead can, and progress is posted back into the thread", async () => {
    const { id } = await createGroup(await ctxFor(lead.id), { name: "FigureWeb ops", memberIds: [a.id] });
    const { id: msgId } = await sendMessage(await ctxFor(lead.id), text(id, "Renew client SSL before Friday"));
    const input = { messageId: msgId, title: "Renew SSL", assigneeId: a.id, unitId: units.FIGUREWEB };
    await expect(messageToTask(await ctxFor(a.id), input)).rejects.toBeInstanceOf(ForbiddenError);
    const { taskId } = await messageToTask(await ctxFor(lead.id), input);
    const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task).toMatchObject({ source: "CHAT", chatMessageId: msgId, origin: "TEAM_LEAD", assigneeId: a.id });
    await expect(messageToTask(await ctxFor(lead.id), input)).rejects.toBeInstanceOf(RuleError);

    await moveTask(await ctxFor(a.id), { taskId, status: "DONE", beforeId: null, afterId: null });
    const replies = await db.chatMessage.findMany({ where: { parentId: msgId, kind: "system" } });
    expect(replies.some((r) => r.body.includes("completed"))).toBe(true);
  });
});

describe("announcements", () => {
  it("a unit lead can announce to their unit but not company-wide", async () => {
    await expect(publishAnnouncement(await ctxFor(lead.id), { title: "Everyone read this", body: "Hello company", unitId: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(publishAnnouncement(await ctxFor(lead.id), { title: "FigureWeb update", body: "New SLA rules", unitId: units.FIGUREWEB })).resolves.toHaveProperty("id");
  });
});

describe("targets", () => {
  it("measures deals closed from the CRM, and leads can't set targets outside their unit", async () => {
    const week = weekStartOf(localDate(new Date()));
    await setTarget(await ctxFor(lead.id), { userId: a.id, weekStart: week, metric: "DEALS_CLOSED", targetValue: 3 });
    await expect(setTarget(await ctxFor(lead.id), { userId: outsider.id, weekStart: week, metric: "DEALS_CLOSED", targetValue: 3 })).rejects.toBeInstanceOf(NotFoundError);
    const pipeline = await db.pipeline.create({ data: { unitId: units.FIGUREWEB, name: `P ${Date.now()}`, stages: { create: [{ name: "Won", position: 1, kind: "WON", probability: 100 }] } }, include: { stages: true } });
    await db.deal.create({ data: { unitId: units.FIGUREWEB, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title: "Hosting deal", ownerId: a.id, status: "WON", wonAt: new Date(), rank: "a" } });
    expect(await measure("DEALS_CLOSED", a.id, week)).toBe(1);
  });
});
