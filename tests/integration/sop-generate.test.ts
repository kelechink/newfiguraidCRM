import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { generateDueTasks, listSops, saveSop } from "@/server/modules/sops/service";
import { listBoard } from "@/server/modules/tasks/service";
import { ctxFor, ensureRolesAndUnits, isHolidayToday, makeSopDueToday, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let founder: { id: string }, webLead: { id: string }, telLead: { id: string };
let webStaff: { id: string }, webStaff2: { id: string }, telStaff: { id: string };
let holiday = false;

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  founder = await makeUser({ role: "super_admin", unitId: units.HQ });
  webLead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  telLead = await makeUser({ role: "unit_manager", unitId: units.TELECOM });
  webStaff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  webStaff2 = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  telStaff = await makeUser({ role: "telecom_ops", unitId: units.TELECOM });
  holiday = await isHolidayToday();
});

describe("Generate due tasks", () => {
  it("creates one SOP-origin task per assignee, with the steps as a checklist", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id, webStaff2.id] });
    const res = await generateDueTasks(await ctxFor(webLead.id), { sopId: sop.id });
    expect(res.created).toBe(2);

    const tasks = await db.task.findMany({ where: { sopId: sop.id }, include: { checklist: { orderBy: { position: "asc" } } } });
    expect(tasks.map((t) => t.assigneeId).sort()).toEqual([webStaff.id, webStaff2.id].sort());
    for (const t of tasks) {
      expect(t.origin).toBe("SOP");
      expect(t.status).toBe("TODO");
      expect(t.checklist.map((c) => c.label)).toEqual(["First", "Second", "Third"]);
      expect(t.dueAt).not.toBeNull();
    }
    expect((await db.sop.findUniqueOrThrow({ where: { id: sop.id } })).lastGeneratedOn).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "sop.generate", entityId: sop.id } })).toBe(1);
  });

  it("a daily SOP that's been ignored all week yields one task, not one per missed day", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    await db.sop.update({ where: { id: sop.id }, data: { frequency: "DAILY", startsOn: new Date(Date.now() - 14 * 86_400_000) } });
    const res = await generateDueTasks(await ctxFor(webLead.id), { sopId: sop.id });
    // weekends have no daily occurrence, so a Sat/Sun run may legitimately pick Friday's
    expect(res.created).toBe(1);
  });

  it("is idempotent — pressing again creates nothing", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    const lead = await ctxFor(webLead.id);
    expect((await generateDueTasks(lead, { sopId: sop.id })).created).toBe(1);
    expect((await generateDueTasks(lead, { sopId: sop.id })).created).toBe(0);
    expect(await db.task.count({ where: { sopId: sop.id } })).toBe(1);
  });

  it("two leads pressing at the same moment still produce one task each", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id, webStaff2.id] });
    const [a, b] = await Promise.all([
      generateDueTasks(await ctxFor(webLead.id), { sopId: sop.id }),
      generateDueTasks(await ctxFor(founder.id), { sopId: sop.id }),
    ]);
    expect(a.created + b.created).toBe(2);
    expect(await db.task.count({ where: { sopId: sop.id } })).toBe(2);
  });

  it("a newly added assignee gets their task on the next press", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    const lead = await ctxFor(webLead.id);
    await generateDueTasks(lead, { sopId: sop.id });
    await db.sopAssignee.create({ data: { sopId: sop.id, userId: webStaff2.id } });
    expect((await generateDueTasks(lead, { sopId: sop.id })).created).toBe(1);
  });

  it("dry run reports what's due without creating anything", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    const res = await generateDueTasks(await ctxFor(webLead.id), { sopId: sop.id, dryRun: true });
    expect(res).toMatchObject({ created: 0, dryRun: true, sops: 1 });
    expect(await db.task.count({ where: { sopId: sop.id } })).toBe(0);
    const card = (await listSops(await ctxFor(webLead.id), { unitId: null })).find((s) => s.id === sop.id);
    expect(card?.dueNow).toBe(1);
  });

  it("skips paused SOPs, on-demand SOPs and assignees who have left", async () => {
    if (holiday) return;
    const gone = await makeUser({ role: "staff", unitId: units.FIGUREWEB, status: "EXITED" });
    const paused = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    await db.sop.update({ where: { id: paused.id }, data: { isActive: false } });
    const onDemand = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    await db.sop.update({ where: { id: onDemand.id }, data: { frequency: "ON_DEMAND" } });
    const withLeaver = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [gone.id, webStaff.id] });

    const lead = await ctxFor(webLead.id);
    expect((await generateDueTasks(lead, { sopId: paused.id })).created).toBe(0);
    expect((await generateDueTasks(lead, { sopId: onDemand.id })).created).toBe(0);
    expect((await generateDueTasks(lead, { sopId: withLeaver.id })).created).toBe(1);
    expect(await db.task.count({ where: { sopId: withLeaver.id, assigneeId: gone.id } })).toBe(0);
  });

  it("staff cannot generate tasks", async () => {
    await expect(generateDueTasks(await ctxFor(webStaff.id), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a lead can't generate another unit's SOP, and 'generate all' only touches their unit", async () => {
    if (holiday) return;
    const telSop = await makeSopDueToday({ unitId: units.TELECOM, ownerId: telLead.id, assigneeIds: [telStaff.id] });
    const lead = await ctxFor(webLead.id);
    await expect(generateDueTasks(lead, { sopId: telSop.id })).rejects.toBeInstanceOf(NotFoundError);
    await generateDueTasks(lead, {});
    expect(await db.task.count({ where: { sopId: telSop.id } })).toBe(0);
  });

  it("generated tasks show up on the assignee's board under the SOP origin", async () => {
    if (holiday) return;
    const sop = await makeSopDueToday({ unitId: units.FIGUREWEB, ownerId: webLead.id, assigneeIds: [webStaff.id] });
    await generateDueTasks(await ctxFor(webLead.id), { sopId: sop.id });
    const board = await listBoard(await ctxFor(webStaff.id), { origin: "SOP" });
    const task = board.find((t) => t.sop?.id === sop.id);
    expect(task).toMatchObject({ origin: "SOP", status: "TODO", checklist: { done: 0, total: 3 } });
  });
});

describe("SOP templates", () => {
  const valid = (unitId: string, assigneeIds: string[]) => ({
    title: "Weekly check",
    unitId,
    frequency: "WEEKLY",
    weekdays: [1, 4],
    dueTime: "11:00",
    assigneeIds,
    steps: [{ title: "Do the thing" }],
  });

  it("a lead can create an SOP for their unit; editing steps bumps the version", async () => {
    const lead = await ctxFor(webLead.id);
    const { id } = await saveSop(lead, valid(units.FIGUREWEB, [webStaff.id]));
    await saveSop(lead, { ...valid(units.FIGUREWEB, [webStaff.id]), id, steps: [{ title: "Do the thing" }, { title: "Then this" }] });
    const sop = await db.sop.findUniqueOrThrow({ where: { id }, include: { steps: true } });
    expect(sop.version).toBe(2);
    expect(sop.steps).toHaveLength(2);
    await saveSop(lead, { ...valid(units.FIGUREWEB, [webStaff.id]), id, title: "Renamed", steps: [{ title: "Do the thing" }, { title: "Then this" }] });
    expect((await db.sop.findUniqueOrThrow({ where: { id } })).version).toBe(2);
  });

  it("rejects assignees from another unit and SOPs in another unit", async () => {
    const lead = await ctxFor(webLead.id);
    await expect(saveSop(lead, valid(units.FIGUREWEB, [telStaff.id]))).rejects.toBeInstanceOf(RuleError);
    await expect(saveSop(lead, valid(units.TELECOM, [telStaff.id]))).rejects.toBeInstanceOf(RuleError);
  });

  it("staff can read their unit's SOPs but not create them", async () => {
    const staff = await ctxFor(webStaff.id);
    await expect(listSops(staff, { unitId: null })).resolves.toBeInstanceOf(Array);
    await expect(saveSop(staff, valid(units.FIGUREWEB, [webStaff.id]))).rejects.toBeInstanceOf(ForbiddenError);
    const sops = await listSops(staff, { unitId: null });
    expect(sops.every((s) => s.unit.id === units.FIGUREWEB && !s.canEdit)).toBe(true);
  });

  it("validates schedules: weekly needs days, scheduled SOPs need assignees", async () => {
    const lead = await ctxFor(webLead.id);
    await expect(saveSop(lead, { ...valid(units.FIGUREWEB, [webStaff.id]), weekdays: [] })).rejects.toThrow(/Pick at least one day/);
    await expect(saveSop(lead, valid(units.FIGUREWEB, []))).rejects.toThrow(/at least one assignee/);
  });
});
