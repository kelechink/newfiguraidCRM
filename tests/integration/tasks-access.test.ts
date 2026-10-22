import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { createTask, listBoard, moveTask, toggleChecklistItem } from "@/server/modules/tasks/service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let founder: { id: string }, ops: { id: string }, webLead: { id: string }, telLead: { id: string };
let webStaff: { id: string }, webStaff2: { id: string }, telStaff: { id: string };

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  founder = await makeUser({ role: "super_admin", unitId: units.HQ, extraUnitIds: [units.ACADEMY, units.FIGUREWEB, units.TELECOM] });
  ops = await makeUser({ role: "ops_manager", unitId: units.HQ });
  webLead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  telLead = await makeUser({ role: "unit_manager", unitId: units.TELECOM });
  webStaff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  webStaff2 = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  telStaff = await makeUser({ role: "telecom_ops", unitId: units.TELECOM });
});

const newTask = (unitId: string, assigneeId: string, extra: Record<string, unknown> = {}) => ({
  title: `Task ${Math.random().toString(36).slice(2, 8)}`,
  unitId,
  assigneeId,
  ...extra,
});

describe("task origins", () => {
  it("founder-created tasks are FOUNDER, everyone else's are TEAM_LEAD", async () => {
    const a = await createTask(await ctxFor(founder.id), newTask(units.TELECOM, telStaff.id));
    const b = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id));
    const c = await createTask(await ctxFor(ops.id), newTask(units.TELECOM, telStaff.id));
    const rows = await db.task.findMany({ where: { id: { in: [a.id, b.id, c.id] } } });
    const by = Object.fromEntries(rows.map((r) => [r.id, r.origin]));
    expect(by[a.id]).toBe("FOUNDER");
    expect(by[b.id]).toBe("TEAM_LEAD");
    expect(by[c.id]).toBe("TEAM_LEAD");
  });

  it("ignores an origin sent by the client", async () => {
    const t = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id, { origin: "FOUNDER" }));
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).origin).toBe("TEAM_LEAD");
  });

  it("records the creation in the audit log and notifies the assignee", async () => {
    const t = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id));
    expect(await db.auditLog.count({ where: { entityId: t.id, action: "task.create" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: webStaff.id, link: { contains: t.id } } })).toBe(1);
  });
});

describe("who may assign work", () => {
  it("staff cannot create tasks", async () => {
    await expect(createTask(await ctxFor(webStaff.id), newTask(units.FIGUREWEB, webStaff2.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a unit lead cannot create tasks in another unit", async () => {
    await expect(createTask(await ctxFor(webLead.id), newTask(units.TELECOM, telStaff.id))).rejects.toBeInstanceOf(RuleError);
  });

  it("a unit lead cannot assign someone outside their unit, even inside their own unit's task", async () => {
    await expect(createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, telStaff.id))).rejects.toBeInstanceOf(RuleError);
  });

  it("cannot assign to an exited member of staff", async () => {
    const gone = await makeUser({ role: "staff", unitId: units.FIGUREWEB, status: "EXITED" });
    await expect(createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, gone.id))).rejects.toBeInstanceOf(RuleError);
  });

  it("a staff member still onboarding (contract pack unsigned) is locked out of tasks", async () => {
    const newbie = await makeUser({ role: "staff", unitId: units.FIGUREWEB, status: "ONBOARDING" });
    await expect(listBoard(await ctxFor(newbie.id), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a temporary grant works until it expires", async () => {
    const staff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
    await db.userGrant.create({
      data: { userId: staff.id, module: "tasks", action: "CREATE", scope: "UNIT", grantedById: founder.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(createTask(await ctxFor(staff.id), newTask(units.FIGUREWEB, webStaff.id))).resolves.toHaveProperty("id");
    await db.userGrant.updateMany({ where: { userId: staff.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(createTask(await ctxFor(staff.id), newTask(units.FIGUREWEB, webStaff.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unknown permission key in the database grants nothing", async () => {
    const staff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
    await db.userGrant.create({ data: { userId: staff.id, module: "tasks.everything", action: "CREATE", scope: "ALL", grantedById: founder.id } });
    await expect(createTask(await ctxFor(staff.id), newTask(units.FIGUREWEB, webStaff.id))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("who sees what on the board", () => {
  it("staff see only their own tasks; leads see their unit; founder sees everything", async () => {
    const mine = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id));
    const colleague = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff2.id));
    const telecom = await createTask(await ctxFor(telLead.id), newTask(units.TELECOM, telStaff.id));

    const staffBoard = (await listBoard(await ctxFor(webStaff.id), {})).map((t) => t.id);
    expect(staffBoard).toContain(mine.id);
    expect(staffBoard).not.toContain(colleague.id);
    expect(staffBoard).not.toContain(telecom.id);

    const leadBoard = (await listBoard(await ctxFor(webLead.id), {})).map((t) => t.id);
    expect(leadBoard).toEqual(expect.arrayContaining([mine.id, colleague.id]));
    expect(leadBoard).not.toContain(telecom.id);

    const founderBoard = (await listBoard(await ctxFor(founder.id), {})).map((t) => t.id);
    expect(founderBoard).toEqual(expect.arrayContaining([mine.id, colleague.id, telecom.id]));
  });

  it("the unit filter narrows but never widens what you can see", async () => {
    const telecom = await createTask(await ctxFor(telLead.id), newTask(units.TELECOM, telStaff.id));
    const board = await listBoard(await ctxFor(webLead.id), { unitId: units.TELECOM });
    expect(board.map((t) => t.id)).not.toContain(telecom.id);
    expect(board.every((t) => t.unit.id === units.TELECOM)).toBe(true);
  });

  it("support agents have no task access at all", async () => {
    const agent = await makeUser({ role: "support_agent", unitId: units.FIGUREWEB });
    await expect(listBoard(await ctxFor(agent.id), {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("moving cards", () => {
  it("staff can move their own task and the order sticks", async () => {
    const lead = await ctxFor(webLead.id);
    const a = await createTask(lead, newTask(units.FIGUREWEB, webStaff.id));
    const b = await createTask(lead, newTask(units.FIGUREWEB, webStaff.id));
    const me = await ctxFor(webStaff.id);

    await moveTask(me, { taskId: a.id, status: "IN_PROGRESS", beforeId: null, afterId: null });
    await moveTask(me, { taskId: b.id, status: "IN_PROGRESS", beforeId: null, afterId: a.id }); // b above a
    const col = (await listBoard(me, {})).filter((t) => t.status === "IN_PROGRESS").map((t) => t.id);
    expect(col.indexOf(b.id)).toBeLessThan(col.indexOf(a.id));

    await moveTask(me, { taskId: b.id, status: "IN_PROGRESS", beforeId: a.id, afterId: null }); // b below a
    const col2 = (await listBoard(me, {})).filter((t) => t.status === "IN_PROGRESS").map((t) => t.id);
    expect(col2.indexOf(b.id)).toBeGreaterThan(col2.indexOf(a.id));

    const started = await db.task.findUniqueOrThrow({ where: { id: a.id } });
    expect(started.startedAt).not.toBeNull();
  });

  it("moving to Done stamps completion, moving back clears it", async () => {
    const t = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id));
    const me = await ctxFor(webStaff.id);
    await moveTask(me, { taskId: t.id, status: "DONE", beforeId: null, afterId: null });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).completedAt).not.toBeNull();
    await moveTask(me, { taskId: t.id, status: "TODO", beforeId: null, afterId: null });
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).completedAt).toBeNull();
  });

  it("staff cannot move a colleague's task — it looks like it doesn't exist", async () => {
    const theirs = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff2.id));
    await expect(
      moveTask(await ctxFor(webStaff.id), { taskId: theirs.id, status: "DONE", beforeId: null, afterId: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.task.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("TODO");
  });

  it("a lead cannot move another unit's task", async () => {
    const tel = await createTask(await ctxFor(telLead.id), newTask(units.TELECOM, telStaff.id));
    await expect(moveTask(await ctxFor(webLead.id), { taskId: tel.id, status: "DONE", beforeId: null, afterId: null })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects statuses that aren't board columns", async () => {
    const t = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff.id));
    await expect(moveTask(await ctxFor(webStaff.id), { taskId: t.id, status: "CANCELLED", beforeId: null, afterId: null })).rejects.toThrow();
  });

  it("checklist items follow the task's edit scope", async () => {
    const t = await createTask(await ctxFor(webLead.id), newTask(units.FIGUREWEB, webStaff2.id));
    const item = await db.taskChecklistItem.create({ data: { taskId: t.id, position: 1, label: "Step" } });
    await expect(toggleChecklistItem(await ctxFor(webStaff.id), { itemId: item.id, done: true })).rejects.toBeInstanceOf(NotFoundError);
    await toggleChecklistItem(await ctxFor(webStaff2.id), { itemId: item.id, done: true });
    expect((await db.taskChecklistItem.findUniqueOrThrow({ where: { id: item.id } })).doneAt).not.toBeNull();
  });
});
