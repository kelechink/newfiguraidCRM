import "server-only";
import type { Prisma } from "@prisma/client";
import { computeDay, DEFAULT_SCHEDULE, evaluatePunch, FLAG_LABEL, haversineMeters, type PunchFlag, type Schedule } from "@/domain/attendance/rules";
import { addDays, isoWeekday, localDate } from "@/domain/sop/schedule";
import { audit } from "@/server/audit/audit";
import type { PermScope } from "@/server/authz/catalog";
import { can, requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { signedFileUrl, storeFile } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";
import { ExcuseDecision, ExcuseInput, LeaveDecision, LeaveInput, MonthInput, OfficeInput, PunchFields, ReviewInput, DeviceDecision } from "./schemas";

// ── scope helpers ────────────────────────────────────────────────────────────

/** People the caller may see for a scope: OWN = self, UNIT = colleagues in their units. */
function peopleWhere(ctx: Ctx, scope: PermScope): Prisma.UserWhereInput {
  if (scope === "ALL") return {};
  if (scope === "UNIT") return { OR: [{ primaryUnitId: { in: ctx.unitIds } }, { units: { some: { unitId: { in: ctx.unitIds } } } }] };
  return { id: ctx.userId };
}

async function assertCanSeePerson(ctx: Ctx, userId: string, module: "attendance" | "attendance.review" | "leave", action: "VIEW" | "APPROVE") {
  if (userId === ctx.userId && module !== "attendance.review") return;
  const scope = requireScope(ctx, module, action);
  const ok = await db.user.count({ where: { AND: [{ id: userId }, peopleWhere(ctx, scope)] } });
  if (!ok) throw new NotFoundError("Person");
}

// ── schedule & day computation ───────────────────────────────────────────────

async function profileFor(userId: string) {
  const p = await db.staffProfile.findUnique({ where: { userId }, include: { office: true } });
  const schedule: Schedule = p
    ? { resumeTime: p.resumeTime, closeTime: p.closeTime, graceMinutes: p.graceMinutes, workingDays: p.workingDays }
    : DEFAULT_SCHEDULE;
  return { schedule, office: p?.office ?? null, remoteAllowed: p?.remoteAllowed ?? false };
}

async function isHoliday(date: string) {
  return !!(await db.publicHoliday.findUnique({ where: { date: new Date(date) } }));
}

async function onApprovedLeave(userId: string, date: string) {
  const d = new Date(date);
  return !!(await db.leaveRequest.findFirst({ where: { userId, status: "APPROVED", startDate: { lte: d }, endDate: { gte: d } } }));
}

/** Recompute and persist one person's day from their punches, leave, holidays and schedule. */
export async function recomputeDay(userId: string, date: string) {
  const day = await db.attendanceDay.upsert({ where: { userId_date: { userId, date: new Date(date) } }, update: {}, create: { userId, date: new Date(date) } });
  if (day.payrollLockedAt) return day;
  const punches = await db.attendancePunch.findMany({ where: { dayId: day.id } });
  const { schedule } = await profileFor(userId);
  const r = computeDay({
    date,
    today: localDate(new Date()),
    schedule,
    punches: punches.map((p) => ({ type: p.type, at: p.deviceTime, accepted: p.reviewStatus !== "REJECTED" })),
    onLeave: await onApprovedLeave(userId, date),
    holiday: await isHoliday(date),
  });
  return db.attendanceDay.update({
    where: { id: day.id },
    data: {
      status: r.status,
      scheduledStart: r.scheduledStart,
      scheduledEnd: r.scheduledEnd,
      firstInAt: r.firstInAt,
      lastOutAt: r.lastOutAt,
      minutesLate: r.minutesLate,
      workedMinutes: r.workedMinutes,
      overtimeMinutes: r.overtimeMinutes,
      isFlagged: punches.some((p) => p.reviewStatus === "PENDING"),
    },
  });
}

// ── clock in / out ───────────────────────────────────────────────────────────

export async function clockState(ctx: Ctx, fingerprint: string | null) {
  requireScope(ctx, "attendance", "VIEW");
  const today = localDate(new Date());
  const [day, device, approvedCount, prof] = await Promise.all([
    db.attendanceDay.findUnique({
      where: { userId_date: { userId: ctx.userId, date: new Date(today) } },
      include: { punches: { orderBy: { deviceTime: "asc" } } },
    }),
    fingerprint ? db.device.findUnique({ where: { userId_fingerprint: { userId: ctx.userId, fingerprint } } }) : null,
    db.device.count({ where: { userId: ctx.userId, status: "APPROVED" } }),
    profileFor(ctx.userId),
  ]);
  const punches = (day?.punches ?? []).filter((p) => p.reviewStatus !== "REJECTED");
  const last = punches.at(-1);
  return {
    today,
    clockedIn: last?.type === "IN",
    status: day?.status ?? "PENDING",
    minutesLate: day?.minutesLate ?? 0,
    workedMinutes: day?.workedMinutes ?? 0,
    punches: (day?.punches ?? []).map((p) => ({ id: p.id, type: p.type, at: p.deviceTime.toISOString(), flags: p.flags as PunchFlag[], reviewStatus: p.reviewStatus })),
    schedule: prof.schedule,
    isWorkingDay: prof.schedule.workingDays.includes(isoWeekday(today)),
    office: prof.office ? { name: prof.office.name, radiusM: prof.office.radiusM } : null,
    device: device ? device.status : approvedCount ? "OTHER_APPROVED" : "NONE",
  };
}

export interface PunchResult {
  type: "IN" | "OUT";
  at: string;
  distanceM: number | null;
  flags: { key: PunchFlag; label: string }[];
  needsReview: boolean;
  status: string;
  minutesLate: number;
}

export async function punch(ctx: Ctx, form: FormData, meta: { ip: string | null; userAgent: string | null }): Promise<PunchResult> {
  requireScope(ctx, "attendance", "CREATE");
  const f = PunchFields.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const receivedAt = new Date();
  if (f.deviceTime.getTime() > receivedAt.getTime() + 10 * 60_000) throw new RuleError("Your phone's clock is ahead. Fix the time and try again.");
  if (f.deviceTime.getTime() < receivedAt.getTime() - 7 * 86_400_000) throw new RuleError("Offline clock-ins older than 7 days can't be synced. Ask HR to record it.");
  const date = localDate(f.deviceTime);

  const prof = await profileFor(ctx.userId);
  const location = f.lat !== undefined && f.lng !== undefined ? { lat: f.lat, lng: f.lng, accuracyM: f.accuracy ?? 9999 } : null;
  let office = prof.office;
  if (!office && location) {
    // No assigned office: measure against the nearest active one.
    const offices = await db.office.findMany({ where: { isActive: true } });
    office = offices.sort((a, b) => haversineMeters(location, { lat: Number(a.latitude), lng: Number(a.longitude) }) - haversineMeters(location, { lat: Number(b.latitude), lng: Number(b.longitude) }))[0] ?? null;
  }

  // Device binding: the first phone binds automatically; any other phone needs approval.
  let device = await db.device.findUnique({ where: { userId_fingerprint: { userId: ctx.userId, fingerprint: f.fingerprint } } });
  if (!device) {
    const everApproved = await db.device.count({ where: { userId: ctx.userId, approvedAt: { not: null } } });
    device = await db.device.create({
      data: {
        userId: ctx.userId,
        fingerprint: f.fingerprint,
        label: f.deviceLabel ?? null,
        userAgent: meta.userAgent,
        status: everApproved ? "PENDING" : "APPROVED",
        approvedAt: everApproved ? null : new Date(),
      },
    });
    await db.$transaction((tx) =>
      audit(tx, { actorId: ctx.userId, action: everApproved ? "attendance.device.request" : "attendance.device.bind", entityType: "Device", entityId: device!.id, after: { userAgent: meta.userAgent } }),
    );
    if (everApproved) {
      const mgr = await db.user.findUnique({ where: { id: ctx.userId }, select: { managerId: true } });
      if (mgr?.managerId) await notify({ userIds: [mgr.managerId], type: "attendance.device", title: `${ctx.name} is clocking in from a new phone`, body: "Approve or reject the device in Attendance → Review.", link: "/work/attendance?tab=review" });
    }
  }

  let selfieId: string | null = null;
  let selfieHash: string | null = null;
  const selfie = form.get("selfie");
  if (selfie && typeof selfie !== "string" && selfie.size > 0) {
    const stored = await storeFile({ bytes: Buffer.from(await selfie.arrayBuffer()), filename: `selfie-${date}.jpg`, purpose: "selfie", userId: ctx.userId });
    selfieId = stored.id;
    selfieHash = stored.sha256;
  }
  const selfieReused = selfieHash ? (await db.attendancePunch.count({ where: { selfieHash } })) > 0 : false;

  const previous = await db.attendancePunch.findFirst({ where: { userId: ctx.userId }, orderBy: { deviceTime: "desc" } });
  const identicalToPrevious =
    !!location && !!previous?.latitude && Number(previous.latitude) === Number(location.lat.toFixed(6)) && Number(previous.longitude) === Number(location.lng.toFixed(6));

  const verdict = evaluatePunch({
    office: office ? { lat: Number(office.latitude), lng: Number(office.longitude), radiusM: office.radiusM } : null,
    location,
    deviceTrusted: device.status === "APPROVED",
    hasSelfie: !!selfieId,
    selfieReused,
    deviceTime: f.deviceTime,
    receivedAt,
    wasOffline: f.wasOffline,
    identicalToPrevious,
    remoteAllowed: prof.remoteAllowed,
  });

  const day = await db.attendanceDay.upsert({
    where: { userId_date: { userId: ctx.userId, date: new Date(date) } },
    update: {},
    create: { userId: ctx.userId, date: new Date(date) },
    include: { punches: { where: { reviewStatus: { not: "REJECTED" } }, orderBy: { deviceTime: "desc" }, take: 1 } },
  });
  if (day.payrollLockedAt) throw new RuleError("That day is already closed for payroll. Ask HR to correct it.");
  const lastType = day.punches[0]?.type;
  if (lastType === f.type) throw new RuleError(f.type === "IN" ? "You're already clocked in." : "You're already clocked out.");
  if (!lastType && f.type === "OUT") throw new RuleError("Clock in first.");

  await db.attendancePunch.create({
    data: {
      userId: ctx.userId,
      dayId: day.id,
      type: f.type,
      deviceTime: f.deviceTime,
      receivedAt,
      wasOffline: f.wasOffline,
      officeId: office?.id ?? null,
      latitude: location ? location.lat.toFixed(6) : null,
      longitude: location ? location.lng.toFixed(6) : null,
      accuracyM: location ? location.accuracyM : null,
      distanceM: verdict.distanceM,
      withinGeofence: verdict.withinGeofence,
      ip: meta.ip,
      userAgent: meta.userAgent,
      deviceId: device.id,
      deviceTrusted: device.status === "APPROVED",
      selfieFileId: selfieId,
      selfieHash,
      flags: verdict.flags,
      reviewStatus: verdict.needsReview ? "PENDING" : "NOT_REQUIRED",
    },
  });
  const updated = await recomputeDay(ctx.userId, date);

  if (verdict.needsReview) {
    const mgr = await db.user.findUnique({ where: { id: ctx.userId }, select: { managerId: true } });
    if (mgr?.managerId) {
      await notify({
        userIds: [mgr.managerId],
        type: "attendance.flagged",
        title: `${ctx.name}'s clock-${f.type === "IN" ? "in" : "out"} needs review`,
        body: verdict.flags.map((k) => FLAG_LABEL[k]).join(" · "),
        link: "/work/attendance?tab=review",
      });
    }
  }
  return {
    type: f.type,
    at: f.deviceTime.toISOString(),
    distanceM: verdict.distanceM,
    flags: verdict.flags.map((k) => ({ key: k, label: FLAG_LABEL[k] })),
    needsReview: verdict.needsReview,
    status: updated.status,
    minutesLate: updated.minutesLate,
  };
}

// ── calendars & team ─────────────────────────────────────────────────────────

export interface CalendarDay {
  date: string;
  status: string;
  minutesLate: number;
  workedMinutes: number;
  firstInAt: string | null;
  lastOutAt: string | null;
  flagged: boolean;
  excuse: string | null; // PENDING | APPROVED | REJECTED
}

/** A month of days for a person, computed live so the calendar is right even before nightly close. */
export async function monthCalendar(ctx: Ctx, raw: unknown): Promise<{ user: { id: string; name: string }; days: CalendarDay[] }> {
  const { month, userId = ctx.userId } = MonthInput.parse(raw);
  await assertCanSeePerson(ctx, userId, "attendance", "VIEW");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, createdAt: true } });
  const from = `${month}-01`;
  const to = addDays(addDays(from, 32).slice(0, 8) + "01", -1);
  const today = localDate(new Date());
  const [stored, leave, holidays, prof] = await Promise.all([
    db.attendanceDay.findMany({ where: { userId, date: { gte: new Date(from), lte: new Date(to) } }, include: { punches: true, excuses: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.leaveRequest.findMany({ where: { userId, status: "APPROVED", startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } } }),
    db.publicHoliday.findMany({ where: { date: { gte: new Date(from), lte: new Date(to) } } }),
    profileFor(userId),
  ]);
  const byDate = new Map(stored.map((d) => [d.date.toISOString().slice(0, 10), d]));
  const hol = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const startedOn = localDate(user.createdAt);
  const days: CalendarDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rec = byDate.get(d);
    const onLeave = leave.some((l) => l.startDate.toISOString().slice(0, 10) <= d && l.endDate.toISOString().slice(0, 10) >= d);
    const r =
      d > today || d < startedOn
        ? null
        : computeDay({
            date: d,
            today,
            schedule: prof.schedule,
            punches: (rec?.punches ?? []).map((p) => ({ type: p.type, at: p.deviceTime, accepted: p.reviewStatus !== "REJECTED" })),
            onLeave,
            holiday: hol.has(d),
          });
    days.push({
      date: d,
      status: r ? (rec?.payrollLockedAt ? rec.status : r.status) : d > today ? "FUTURE" : "NONE",
      minutesLate: r?.minutesLate ?? 0,
      workedMinutes: r?.workedMinutes ?? 0,
      firstInAt: r?.firstInAt?.toISOString() ?? null,
      lastOutAt: r?.lastOutAt?.toISOString() ?? null,
      flagged: !!rec?.punches.some((p) => p.reviewStatus === "PENDING"),
      excuse: rec?.excuses[0]?.status ?? null,
    });
  }
  return { user: { id: user.id, name: user.name }, days };
}

export async function teamToday(ctx: Ctx, opts: { unitId: string | null }) {
  const scope = requireScope(ctx, "attendance", "VIEW");
  if (scope === "OWN") return [];
  const today = localDate(new Date());
  const people = await db.user.findMany({
    where: { AND: [peopleWhere(ctx, scope), { status: "ACTIVE" }, opts.unitId ? { OR: [{ primaryUnitId: opts.unitId }, { units: { some: { unitId: opts.unitId } } }] } : {}] },
    select: {
      id: true,
      name: true,
      primaryUnit: { select: { code: true } },
      staffProfile: { select: { resumeTime: true, graceMinutes: true, workingDays: true, jobTitle: true } },
      attendanceDays: { where: { date: new Date(today) }, include: { punches: { orderBy: { deviceTime: "desc" }, take: 1 } } },
      leaveRequests: { where: { status: "APPROVED", startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  const holiday = await isHoliday(today);
  return people.map((p) => {
    const day = p.attendanceDays[0];
    const last = day?.punches[0];
    const working = (p.staffProfile?.workingDays ?? DEFAULT_SCHEDULE.workingDays).includes(isoWeekday(today));
    let state: "IN" | "OUT" | "LATE" | "NOT_IN" | "LEAVE" | "OFF" = "NOT_IN";
    if (p.leaveRequests.length) state = "LEAVE";
    else if (holiday || !working) state = "OFF";
    else if (last?.type === "IN") state = day?.status === "LATE" ? "LATE" : "IN";
    else if (last?.type === "OUT") state = "OUT";
    return {
      id: p.id,
      name: p.name,
      unit: p.primaryUnit?.code ?? null,
      jobTitle: p.staffProfile?.jobTitle ?? null,
      state,
      firstInAt: day?.firstInAt?.toISOString() ?? null,
      minutesLate: day?.minutesLate ?? 0,
      flagged: day?.isFlagged ?? false,
    };
  });
}

// ── review: flagged punches & devices ────────────────────────────────────────

export async function reviewQueue(ctx: Ctx) {
  const scope = requireScope(ctx, "attendance.review", "VIEW");
  const [punches, devices] = await Promise.all([
    db.attendancePunch.findMany({
      where: { reviewStatus: "PENDING", user: peopleWhere(ctx, scope), userId: { not: ctx.userId } },
      include: { user: { select: { id: true, name: true } }, office: { select: { name: true, radiusM: true } }, device: { select: { label: true, userAgent: true, status: true } } },
      orderBy: { deviceTime: "desc" },
      take: 100,
    }),
    db.device.findMany({ where: { status: "PENDING", user: peopleWhere(ctx, scope), userId: { not: ctx.userId } }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    punches: punches.map((p) => ({
      id: p.id,
      user: p.user,
      type: p.type,
      at: p.deviceTime.toISOString(),
      receivedAt: p.receivedAt.toISOString(),
      wasOffline: p.wasOffline,
      office: p.office,
      distanceM: p.distanceM ? Number(p.distanceM) : null,
      accuracyM: p.accuracyM ? Number(p.accuracyM) : null,
      lat: p.latitude ? Number(p.latitude) : null,
      lng: p.longitude ? Number(p.longitude) : null,
      ip: p.ip,
      device: p.device ? { label: p.device.label ?? p.device.userAgent ?? "Phone", status: p.device.status } : null,
      flags: (p.flags as PunchFlag[]).map((k) => ({ key: k, label: FLAG_LABEL[k] ?? k })),
      selfieUrl: p.selfieFileId ? signedFileUrl(p.selfieFileId, ctx.userId, 900) : null,
    })),
    devices: devices.map((d) => ({ id: d.id, user: d.user, label: d.label ?? d.userAgent ?? "Phone", userAgent: d.userAgent, createdAt: d.createdAt.toISOString() })),
  };
}

export async function reviewPunch(ctx: Ctx, raw: unknown) {
  const input = ReviewInput.parse(raw);
  const scope = requireScope(ctx, "attendance.review", "APPROVE");
  const p = await db.attendancePunch.findFirst({ where: { id: input.punchId, user: peopleWhere(ctx, scope) }, include: { day: true } });
  if (!p) throw new NotFoundError("Clock-in");
  if (p.userId === ctx.userId) throw new ForbiddenError("self-review");
  if (p.day.payrollLockedAt) throw new RuleError("That day is closed for payroll");
  await db.$transaction(async (tx) => {
    await tx.attendancePunch.update({ where: { id: p.id }, data: { reviewStatus: input.decision, reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: input.note || null } });
    await audit(tx, { actorId: ctx.userId, action: `attendance.punch.${input.decision.toLowerCase()}`, entityType: "AttendancePunch", entityId: p.id, after: { note: input.note ?? null } });
  });
  await recomputeDay(p.userId, p.day.date.toISOString().slice(0, 10));
  if (input.decision === "REJECTED") {
    await notify({ userIds: [p.userId], type: "attendance.rejected", title: "A clock-in was rejected", body: input.note ?? "Talk to your manager if you think this is wrong. You can submit an excuse for the day.", link: "/work/attendance?tab=month" });
  }
}

export async function decideDevice(ctx: Ctx, raw: unknown) {
  const input = DeviceDecision.parse(raw);
  const scope = requireScope(ctx, "attendance.review", "APPROVE");
  const d = await db.device.findFirst({ where: { id: input.deviceId, user: peopleWhere(ctx, scope) } });
  if (!d) throw new NotFoundError("Device");
  await db.$transaction(async (tx) => {
    if (input.approve) {
      // one bound phone per person: approving a new one retires the old
      await tx.device.updateMany({ where: { userId: d.userId, status: "APPROVED", id: { not: d.id } }, data: { status: "REVOKED" } });
      await tx.device.update({ where: { id: d.id }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
    } else {
      await tx.device.update({ where: { id: d.id }, data: { status: "REVOKED" } });
    }
    await audit(tx, { actorId: ctx.userId, action: input.approve ? "attendance.device.approve" : "attendance.device.reject", entityType: "Device", entityId: d.id, after: { userId: d.userId } });
  });
  await notify({ userIds: [d.userId], type: "attendance.device", title: input.approve ? "Your new phone is approved for clock-in" : "Your new phone wasn't approved for clock-in", link: "/work/attendance" });
}

// ── leave ────────────────────────────────────────────────────────────────────

async function workingDaysBetween(userId: string, start: string, end: string): Promise<number> {
  const { schedule } = await profileFor(userId);
  const hol = new Set((await db.publicHoliday.findMany({ where: { date: { gte: new Date(start), lte: new Date(end) } } })).map((h) => h.date.toISOString().slice(0, 10)));
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (schedule.workingDays.includes(isoWeekday(d)) && !hol.has(d)) n++;
  return n;
}

export async function requestLeave(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "leave", "CREATE");
  const input = LeaveInput.parse(raw);
  const days = await workingDaysBetween(ctx.userId, input.startDate, input.endDate);
  if (days === 0) throw new RuleError("Those dates have no working days");
  const overlap = await db.leaveRequest.count({
    where: { userId: ctx.userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: new Date(input.endDate) }, endDate: { gte: new Date(input.startDate) } },
  });
  if (overlap) throw new RuleError("You already have leave booked over those dates");
  const row = await db.leaveRequest.create({
    data: { userId: ctx.userId, type: input.type, startDate: new Date(input.startDate), endDate: new Date(input.endDate), days, reason: input.reason || null },
  });
  const mgr = await db.user.findUnique({ where: { id: ctx.userId }, select: { managerId: true } });
  if (mgr?.managerId) await notify({ userIds: [mgr.managerId], type: "leave.requested", title: `${ctx.name} requested ${days} day${days === 1 ? "" : "s"} of leave`, link: "/work/attendance?tab=leave" });
  return { id: row.id, days };
}

export async function listLeave(ctx: Ctx) {
  const approveScope = scopeOf(ctx, "leave", "APPROVE");
  const [mine, toApprove] = await Promise.all([
    db.leaveRequest.findMany({ where: { userId: ctx.userId }, orderBy: { startDate: "desc" }, take: 30 }),
    approveScope
      ? db.leaveRequest.findMany({
          where: { status: { in: ["PENDING", "APPROVED"] }, userId: { not: ctx.userId }, endDate: { gte: new Date(addDays(localDate(new Date()), -30)) }, user: peopleWhere(ctx, approveScope) },
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ status: "desc" }, { startDate: "asc" }],
          take: 100,
        })
      : Promise.resolve([]),
  ]);
  const shape = (l: (typeof mine)[number]) => ({ id: l.id, type: l.type, startDate: l.startDate.toISOString().slice(0, 10), endDate: l.endDate.toISOString().slice(0, 10), days: Number(l.days), reason: l.reason, status: l.status });
  return { mine: mine.map(shape), toApprove: toApprove.map((l) => ({ ...shape(l), user: l.user })), canApprove: !!approveScope };
}

export async function decideLeave(ctx: Ctx, raw: unknown) {
  const input = LeaveDecision.parse(raw);
  const scope = requireScope(ctx, "leave", "APPROVE");
  const l = await db.leaveRequest.findFirst({ where: { id: input.leaveId, user: peopleWhere(ctx, scope) } });
  if (!l) throw new NotFoundError("Leave request");
  if (l.userId === ctx.userId) throw new RuleError("You can't approve your own leave");
  if (l.status !== "PENDING" && input.approve) throw new RuleError("Already decided");
  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: l.id }, data: { status: input.approve ? "APPROVED" : "REJECTED", approverId: ctx.userId, decidedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: input.approve ? "leave.approve" : "leave.reject", entityType: "LeaveRequest", entityId: l.id });
  });
  for (let d = l.startDate.toISOString().slice(0, 10); d <= l.endDate.toISOString().slice(0, 10) && d <= localDate(new Date()); d = addDays(d, 1)) await recomputeDay(l.userId, d);
  await notify({ userIds: [l.userId], type: "leave.decided", title: `Your leave was ${input.approve ? "approved" : "declined"}`, link: "/work/attendance?tab=leave" });
}

export async function cancelLeave(ctx: Ctx, leaveId: string) {
  const l = await db.leaveRequest.findFirst({ where: { id: leaveId, userId: ctx.userId } });
  if (!l) throw new NotFoundError("Leave request");
  if (l.status !== "PENDING") throw new RuleError("Only pending requests can be cancelled — ask your manager");
  await db.leaveRequest.update({ where: { id: l.id }, data: { status: "CANCELLED" } });
}

// ── excuses (before payroll closes) ──────────────────────────────────────────

export async function submitExcuse(ctx: Ctx, raw: unknown) {
  const input = ExcuseInput.parse(raw);
  const day = await recomputeDay(ctx.userId, input.date);
  if (!["LATE", "ABSENT"].includes(day.status) && !day.isFlagged) throw new RuleError("Excuses are only for late, absent or flagged days");
  if (day.payrollLockedAt) throw new RuleError("Payroll for that month has closed");
  if (await db.attendanceExcuse.count({ where: { dayId: day.id, status: { in: ["PENDING", "APPROVED"] } } })) throw new RuleError("You already submitted an excuse for that day");
  await db.attendanceExcuse.create({ data: { dayId: day.id, userId: ctx.userId, reason: input.reason } });
  const mgr = await db.user.findUnique({ where: { id: ctx.userId }, select: { managerId: true } });
  if (mgr?.managerId) await notify({ userIds: [mgr.managerId], type: "attendance.excuse", title: `${ctx.name} submitted an excuse for ${input.date}`, link: "/work/attendance?tab=review" });
}

export async function listExcuses(ctx: Ctx) {
  const scope = scopeOf(ctx, "attendance.review", "APPROVE");
  if (!scope) return [];
  const rows = await db.attendanceExcuse.findMany({
    where: { status: "PENDING", user: peopleWhere(ctx, scope), userId: { not: ctx.userId } },
    include: { user: { select: { id: true, name: true } }, day: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((e) => ({ id: e.id, user: e.user, date: e.day.date.toISOString().slice(0, 10), status: e.day.status, minutesLate: e.day.minutesLate, reason: e.reason }));
}

export async function decideExcuse(ctx: Ctx, raw: unknown) {
  const input = ExcuseDecision.parse(raw);
  const scope = requireScope(ctx, "attendance.review", "APPROVE");
  const e = await db.attendanceExcuse.findFirst({ where: { id: input.excuseId, user: peopleWhere(ctx, scope) }, include: { day: true } });
  if (!e) throw new NotFoundError("Excuse");
  if (e.day.payrollLockedAt) throw new RuleError("Payroll for that month has closed");
  await db.$transaction(async (tx) => {
    await tx.attendanceExcuse.update({ where: { id: e.id }, data: { status: input.approve ? "APPROVED" : "REJECTED", reviewerId: ctx.userId, decidedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: input.approve ? "attendance.excuse.approve" : "attendance.excuse.reject", entityType: "AttendanceExcuse", entityId: e.id });
  });
  await notify({ userIds: [e.userId], type: "attendance.excuse", title: `Your excuse for ${e.day.date.toISOString().slice(0, 10)} was ${input.approve ? "accepted — no deduction" : "not accepted"}`, link: "/me" });
}

// ── export ───────────────────────────────────────────────────────────────────

/** Monthly attendance CSV for payroll. Restricted to exporters and audited (Security #9). */
export async function exportMonthCsv(ctx: Ctx, month: string): Promise<{ filename: string; csv: string }> {
  const scope = requireScope(ctx, "attendance", "VIEW");
  if (scope === "OWN" || !can(ctx, "exports", "CREATE")) throw new ForbiddenError("exports:CREATE");
  const people = await db.user.findMany({ where: { AND: [peopleWhere(ctx, scope), { status: { in: ["ACTIVE", "ONBOARDING"] } }] }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  const lines = [["Name", "Email", "Days present", "Days late", "Minutes late", "Days absent", "Days on leave", "Hours worked", "Overtime hours"].join(",")];
  for (const p of people) {
    const { days } = await monthCalendar(ctx, { month, userId: p.id });
    const count = (s: string) => days.filter((d) => d.status === s).length;
    const sum = (k: "minutesLate" | "workedMinutes") => days.reduce((n, d) => n + d[k], 0);
    const esc = (v: string) => `"${v.replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    lines.push([esc(p.name), esc(p.email), count("PRESENT") + count("LATE"), count("LATE"), sum("minutesLate"), count("ABSENT"), count("ON_LEAVE"), (sum("workedMinutes") / 60).toFixed(1), "0"].join(","));
  }
  const watermark = `# Exported by ${ctx.name} (${ctx.email}) on ${new Date().toISOString()} — confidential`;
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "export.attendance", after: { month, rows: people.length } }));
  return { filename: `attendance-${month}.csv`, csv: `${watermark}\n${lines.join("\n")}\n` };
}

// ── offices (geofence) ───────────────────────────────────────────────────────

export async function listOffices() {
  const rows = await db.office.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { staff: true } } } });
  return rows.map((o) => ({ id: o.id, name: o.name, address: o.address, latitude: Number(o.latitude), longitude: Number(o.longitude), radiusM: o.radiusM, isActive: o.isActive, staff: o._count.staff }));
}

export async function saveOffice(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "settings", "EDIT");
  const input = OfficeInput.parse(raw);
  const data = { name: input.name, address: input.address || null, latitude: input.latitude, longitude: input.longitude, radiusM: input.radiusM, isActive: input.isActive };
  await db.$transaction(async (tx) => {
    const before = input.id ? await tx.office.findUnique({ where: { id: input.id } }) : null;
    const o = input.id ? await tx.office.update({ where: { id: input.id }, data }) : await tx.office.create({ data });
    await audit(tx, { actorId: ctx.userId, action: input.id ? "office.update" : "office.create", entityType: "Office", entityId: o.id, before: before ? { lat: Number(before.latitude), lng: Number(before.longitude), radiusM: before.radiusM } : undefined, after: { lat: input.latitude, lng: input.longitude, radiusM: input.radiusM } });
  });
}

/** Nightly: persist yesterday for everyone so absences exist even without opening the app. */
export async function closeDay(date: string) {
  const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const u of users) await recomputeDay(u.id, date);
  return users.length;
}
