import "server-only";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { can, requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { signedFileUrl, storeFile, type Purpose } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";
import { publish } from "@/server/realtime/bus";
import { createTask } from "@/server/modules/tasks/service";

const id = z.string().cuid();

// ── channels ─────────────────────────────────────────────────────────────────

/** Everyone is in #general and in a channel for each of their units (created on demand). */
async function ensureDefaultChannels(ctx: Ctx) {
  let general = await db.chatChannel.findFirst({ where: { type: "GROUP", name: "General", unitId: null } });
  general ??= await db.chatChannel.create({ data: { type: "GROUP", name: "General" } });
  const wanted = [general.id];
  for (const unitId of ctx.unitIds) {
    let ch = await db.chatChannel.findFirst({ where: { type: "UNIT", unitId } });
    if (!ch) {
      const unit = await db.businessUnit.findUnique({ where: { id: unitId } });
      ch = await db.chatChannel.create({ data: { type: "UNIT", unitId, name: unit?.name ?? "Unit" } });
    }
    wanted.push(ch.id);
  }
  await db.chatMember.createMany({ data: wanted.map((channelId) => ({ channelId, userId: ctx.userId })), skipDuplicates: true });
}

export async function listChannels(ctx: Ctx) {
  requireScope(ctx, "messaging", "VIEW");
  await ensureDefaultChannels(ctx);
  const memberships = await db.chatMember.findMany({
    where: { userId: ctx.userId },
    include: {
      channel: {
        include: {
          members: { include: { user: { select: { id: true, name: true, status: true } } } },
          unit: { select: { code: true } },
          messages: { where: { deletedAt: null, parentId: null }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true, kind: true, author: { select: { name: true } } } },
        },
      },
    },
  });
  const unread = await Promise.all(
    memberships.map((m) =>
      db.chatMessage.count({ where: { channelId: m.channelId, authorId: { not: ctx.userId }, deletedAt: null, createdAt: { gt: m.lastReadAt ?? new Date(0) } } }),
    ),
  );
  return memberships
    .map((m, i) => {
      const ch = m.channel;
      const other = ch.type === "DIRECT" ? ch.members.find((x) => x.userId !== ctx.userId)?.user : null;
      const last = ch.messages[0];
      return {
        id: ch.id,
        type: ch.type,
        name: other?.name ?? ch.name ?? "Channel",
        unitCode: ch.unit?.code ?? null,
        otherUserId: other?.id ?? null,
        memberCount: ch.members.length,
        unread: unread[i] ?? 0,
        lastAt: (last?.createdAt ?? ch.createdAt).toISOString(),
        preview: last ? (last.kind === "voice" ? "🎙 Voice note" : `${ch.type === "DIRECT" ? "" : `${last.author.name.split(" ")[0]}: `}${last.body.slice(0, 80)}`) : "",
      };
    })
    .sort((a, b) => (a.type === "DIRECT") === (b.type === "DIRECT") ? b.lastAt.localeCompare(a.lastAt) : a.type === "DIRECT" ? 1 : -1);
}

async function membership(ctx: Ctx, channelId: string) {
  const m = await db.chatMember.findUnique({ where: { channelId_userId: { channelId, userId: ctx.userId } } });
  if (m) return m;
  throw new NotFoundError("Conversation");
}

export async function openDirect(ctx: Ctx, otherUserId: string): Promise<{ id: string }> {
  requireScope(ctx, "messaging", "CREATE");
  const other = await db.user.findFirst({ where: { id: otherUserId, status: { in: ["ACTIVE", "ONBOARDING"] } } });
  if (!other || other.id === ctx.userId) throw new RuleError("Pick a colleague");
  const dmKey = [ctx.userId, other.id].sort().join(":");
  const existing = await db.chatChannel.findUnique({ where: { dmKey } });
  if (existing) return { id: existing.id };
  const ch = await db.chatChannel.create({ data: { type: "DIRECT", dmKey, members: { create: [{ userId: ctx.userId }, { userId: other.id }] } } });
  return { id: ch.id };
}

export async function createGroup(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  requireScope(ctx, "messaging", "CREATE");
  const input = z.object({ name: z.string().trim().min(2).max(60), memberIds: z.array(id).min(1).max(100), projectId: id.optional() }).parse(raw);
  const members = await db.user.findMany({ where: { id: { in: input.memberIds }, status: { in: ["ACTIVE", "ONBOARDING"] } }, select: { id: true } });
  const ch = await db.chatChannel.create({
    data: {
      type: input.projectId ? "PROJECT" : "GROUP",
      name: input.name,
      projectId: input.projectId,
      members: { create: [...new Set([ctx.userId, ...members.map((m) => m.id)])].map((userId) => ({ userId })) },
    },
  });
  return { id: ch.id };
}

// ── messages ─────────────────────────────────────────────────────────────────

export interface ChatMessageDto {
  id: string;
  author: { id: string; name: string };
  body: string;
  kind: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  isPinned: boolean;
  parentId: string | null;
  replyCount: number;
  attachments: { fileId: string; name: string; mime: string; url: string; durationSec?: number }[];
  task: { id: string; status: string; assignee: string | null } | null;
  mentions: string[];
}

export async function listMessages(ctx: Ctx, raw: unknown) {
  const { channelId, before, parentId } = z.object({ channelId: id, before: z.string().datetime().optional(), parentId: id.optional() }).parse(raw);
  requireScope(ctx, "messaging", "VIEW");
  const member = await db.chatMember.findUnique({ where: { channelId_userId: { channelId, userId: ctx.userId } } });
  if (!member) {
    // Private to participants — except the Super Admin for audit, which is itself audited (PRD Module R).
    if (ctx.roleKey !== "super_admin") throw new NotFoundError("Conversation");
    await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "chat.audit_view", entityType: "ChatChannel", entityId: channelId }));
  }
  const channel = await db.chatChannel.findUniqueOrThrow({
    where: { id: channelId },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  const rows = await db.chatMessage.findMany({
    where: { channelId, parentId: parentId ?? null, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      author: { select: { id: true, name: true } },
      task: { select: { id: true, status: true, assignee: { select: { name: true } } } },
      mentions: { select: { userId: true } },
      _count: { select: { replies: true } },
    },
  });
  const messages: ChatMessageDto[] = rows.reverse().map((m) => ({
    id: m.id,
    author: m.author,
    body: m.deletedAt ? "" : m.body,
    kind: m.kind,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted: !!m.deletedAt,
    isPinned: m.isPinned,
    parentId: m.parentId,
    replyCount: m._count.replies,
    attachments: m.deletedAt
      ? []
      : ((m.attachments as { fileId: string; name: string; mime: string; durationSec?: number }[] | null) ?? []).map((a) => ({ ...a, url: signedFileUrl(a.fileId, ctx.userId, 3600) })),
    task: m.task ? { id: m.task.id, status: m.task.status, assignee: m.task.assignee?.name ?? null } : null,
    mentions: m.mentions.map((x) => x.userId),
  }));
  const pinned = await db.chatMessage.findMany({ where: { channelId, isPinned: true, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, body: true, author: { select: { name: true } } } });
  return {
    channel: {
      id: channel.id,
      type: channel.type,
      name: channel.type === "DIRECT" ? (channel.members.find((x) => x.userId !== ctx.userId)?.user.name ?? "Direct message") : (channel.name ?? "Channel"),
      members: channel.members.map((x) => ({ id: x.user.id, name: x.user.name, lastReadAt: x.lastReadAt?.toISOString() ?? null })),
    },
    messages,
    pinned: pinned.map((p) => ({ id: p.id, body: p.body.slice(0, 140), author: p.author.name })),
    hasMore: rows.length === 60,
  };
}

const SendInput = z.object({
  channelId: id,
  body: z.string().max(8000).default(""),
  parentId: id.optional(),
  mentionIds: z.array(id).max(50).default([]),
});

const ATTACH_PURPOSE = (mime: string): Purpose => (mime.startsWith("audio/") ? "voice" : "attachment");

export async function sendMessage(ctx: Ctx, form: FormData): Promise<{ id: string }> {
  requireScope(ctx, "messaging", "CREATE");
  const input = SendInput.parse({
    channelId: form.get("channelId"),
    body: String(form.get("body") ?? "").trim(),
    parentId: form.get("parentId") || undefined,
    mentionIds: form.getAll("mentionIds").map(String),
  });
  await membership(ctx, input.channelId);
  if (input.parentId) {
    const parent = await db.chatMessage.findFirst({ where: { id: input.parentId, channelId: input.channelId } });
    if (!parent) throw new NotFoundError("Message");
  }
  const attachments: { fileId: string; name: string; mime: string; durationSec?: number }[] = [];
  let kind = "text";
  for (const f of form.getAll("files")) {
    if (typeof f === "string" || f.size === 0) continue;
    const purpose = ATTACH_PURPOSE(f.type);
    const stored = await storeFile({ bytes: Buffer.from(await f.arrayBuffer()), filename: f.name, purpose, userId: ctx.userId });
    const mime = stored.kind === "text" ? "text/csv" : f.type || "application/octet-stream";
    attachments.push({ fileId: stored.id, name: f.name.slice(0, 120), mime, ...(purpose === "voice" ? { durationSec: Number(form.get("durationSec") ?? 0) || undefined } : {}) });
    kind = purpose === "voice" ? "voice" : stored.kind === "jpeg" || stored.kind === "png" || stored.kind === "webp" ? "image" : "file";
  }
  if (!input.body && !attachments.length) throw new RuleError("Write a message first");

  const members = await db.chatMember.findMany({ where: { channelId: input.channelId }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));
  const mentions = input.mentionIds.filter((u) => memberIds.has(u) && u !== ctx.userId);

  const msg = await db.chatMessage.create({
    data: {
      channelId: input.channelId,
      authorId: ctx.userId,
      parentId: input.parentId,
      body: input.body,
      kind: attachments.length && !input.body ? kind : "text",
      attachments: attachments.length ? attachments : undefined,
      mentions: { create: mentions.map((userId) => ({ userId })) },
    },
  });
  await db.chatMember.update({ where: { channelId_userId: { channelId: input.channelId, userId: ctx.userId } }, data: { lastReadAt: msg.createdAt, lastReadMessageId: msg.id } });
  publish([...memberIds], { type: "chat", channelId: input.channelId, messageId: msg.id });

  const channel = await db.chatChannel.findUniqueOrThrow({ where: { id: input.channelId } });
  const preview = input.body ? input.body.slice(0, 140) : kind === "voice" ? "🎙 Voice note" : "📎 Attachment";
  if (channel.type === "DIRECT") {
    await notify({ userIds: [...memberIds].filter((u) => u !== ctx.userId), type: "chat.dm", title: `${ctx.name}`, body: preview, link: `/work/messages?c=${channel.id}` });
  } else if (mentions.length) {
    await notify({ userIds: mentions, type: "chat.mention", title: `${ctx.name} mentioned you in ${channel.name ?? "a channel"}`, body: preview, link: `/work/messages?c=${channel.id}` });
  }
  return { id: msg.id };
}

export async function markRead(ctx: Ctx, channelId: string) {
  const m = await membership(ctx, channelId);
  const last = await db.chatMessage.findFirst({ where: { channelId }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } });
  if (!last || (m.lastReadAt && m.lastReadAt >= last.createdAt)) return;
  await db.chatMember.update({ where: { channelId_userId: { channelId, userId: ctx.userId } }, data: { lastReadAt: last.createdAt, lastReadMessageId: last.id } });
  const members = await db.chatMember.findMany({ where: { channelId }, select: { userId: true } });
  publish(members.map((x) => x.userId), { type: "chat.read", channelId, userId: ctx.userId });
}

export async function togglePin(ctx: Ctx, messageId: string) {
  const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new NotFoundError("Message");
  await membership(ctx, msg.channelId);
  await db.chatMessage.update({ where: { id: msg.id }, data: { isPinned: !msg.isPinned } });
}

/** Soft delete: hidden from the conversation, retained for audit. */
export async function deleteMessage(ctx: Ctx, messageId: string) {
  const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.authorId !== ctx.userId) throw new NotFoundError("Message");
  await db.$transaction(async (tx) => {
    await tx.chatMessage.update({ where: { id: msg.id }, data: { deletedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: "chat.delete", entityType: "ChatMessage", entityId: msg.id });
  });
  const members = await db.chatMember.findMany({ where: { channelId: msg.channelId }, select: { userId: true } });
  publish(members.map((m) => m.userId), { type: "chat", channelId: msg.channelId, messageId: msg.id });
}

const ToTaskInput = z.object({
  messageId: id,
  title: z.string().trim().min(2).max(200),
  assigneeId: id,
  unitId: id,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueAt: z.coerce.date().optional(),
});

/** One click: turn a message into a task. Progress is posted back into the thread. */
export async function messageToTask(ctx: Ctx, raw: unknown): Promise<{ taskId: string }> {
  const input = ToTaskInput.parse(raw);
  const msg = await db.chatMessage.findUnique({ where: { id: input.messageId }, include: { task: true } });
  if (!msg) throw new NotFoundError("Message");
  await membership(ctx, msg.channelId);
  if (msg.task) throw new RuleError("That message is already a task");
  const { id: taskId } = await createTask(
    ctx,
    { title: input.title, description: msg.body ? `From a message: “${msg.body.slice(0, 1000)}”` : undefined, unitId: input.unitId, assigneeId: input.assigneeId, priority: input.priority, dueAt: input.dueAt },
    { source: "CHAT", chatMessageId: msg.id },
  );
  const assignee = await db.user.findUnique({ where: { id: input.assigneeId }, select: { name: true } });
  const sys = await db.chatMessage.create({
    data: { channelId: msg.channelId, authorId: ctx.userId, parentId: msg.id, kind: "system", body: `${ctx.name} turned this into a task for ${assignee?.name ?? "someone"}: “${input.title}”.` },
  });
  const members = await db.chatMember.findMany({ where: { channelId: msg.channelId }, select: { userId: true } });
  publish(members.map((m) => m.userId), { type: "chat", channelId: msg.channelId, messageId: sys.id });
  return { taskId };
}

export async function searchMessages(ctx: Ctx, q: string) {
  requireScope(ctx, "messaging", "VIEW");
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.chatMessage.findMany({
    where: { deletedAt: null, body: { contains: term, mode: "insensitive" }, channel: { members: { some: { userId: ctx.userId } } } },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { author: { select: { name: true } }, channel: { select: { id: true, name: true, type: true } } },
  });
  return rows.map((m) => ({ id: m.id, channelId: m.channel.id, body: m.body.slice(0, 120), author: m.author.name, channel: m.channel.name ?? "Direct message" }));
}

// ── announcements ────────────────────────────────────────────────────────────

export async function listAnnouncements(ctx: Ctx) {
  requireScope(ctx, "announcements", "VIEW");
  const canSeeAcks = can(ctx, "announcements", "CREATE");
  const rows = await db.announcement.findMany({
    where: { OR: [{ unitId: null }, { unitId: { in: ctx.unitIds } }] },
    orderBy: { publishedAt: "desc" },
    take: 30,
    include: { publishedBy: { select: { id: true, name: true } }, acks: { select: { userId: true, ackedAt: true } } },
  });
  const audienceSize = async (unitId: string | null) =>
    db.user.count({ where: { status: { in: ["ACTIVE", "ONBOARDING"] }, ...(unitId ? { OR: [{ primaryUnitId: unitId }, { units: { some: { unitId } } }] } : {}) } });
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      requiresAck: a.requiresAck,
      unitId: a.unitId,
      publishedBy: a.publishedBy,
      publishedAt: a.publishedAt.toISOString(),
      pinned: !!a.pinnedUntil && a.pinnedUntil > new Date(),
      ackedByMe: a.acks.some((x) => x.userId === ctx.userId),
      ackCount: canSeeAcks || a.publishedBy.id === ctx.userId ? a.acks.length : null,
      audience: canSeeAcks || a.publishedBy.id === ctx.userId ? await audienceSize(a.unitId) : null,
    })),
  );
}

export async function pendingAnnouncements(ctx: Ctx) {
  return db.announcement.count({
    where: { requiresAck: true, OR: [{ unitId: null }, { unitId: { in: ctx.unitIds } }], acks: { none: { userId: ctx.userId } }, publishedAt: { lte: new Date() } },
  });
}

export async function publishAnnouncement(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "announcements", "CREATE");
  const input = z
    .object({ title: z.string().trim().min(3).max(140), body: z.string().trim().min(3).max(8000), unitId: id.nullable().default(null), requiresAck: z.boolean().default(true), pinDays: z.number().int().min(0).max(90).default(7) })
    .parse(raw);
  if (scope !== "ALL" && (!input.unitId || !ctx.unitIds.includes(input.unitId))) throw new ForbiddenError("announcements: company-wide needs ALL scope");
  const a = await db.announcement.create({
    data: { title: input.title, body: input.body, unitId: input.unitId, requiresAck: input.requiresAck, publishedById: ctx.userId, pinnedUntil: input.pinDays ? new Date(Date.now() + input.pinDays * 86_400_000) : null },
  });
  const audience = await db.user.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] }, id: { not: ctx.userId }, ...(input.unitId ? { OR: [{ primaryUnitId: input.unitId }, { units: { some: { unitId: input.unitId } } }] } : {}) },
    select: { id: true },
  });
  await notify({ userIds: audience.map((u) => u.id), type: "announcement", title: `📣 ${input.title}`, body: input.requiresAck ? "Please read and acknowledge." : input.body.slice(0, 140), link: "/work/messages?tab=announcements", email: true });
  return { id: a.id };
}

export async function acknowledge(ctx: Ctx, announcementId: string) {
  const a = await db.announcement.findFirst({ where: { id: announcementId, OR: [{ unitId: null }, { unitId: { in: ctx.unitIds } }] } });
  if (!a) throw new NotFoundError("Announcement");
  await db.announcementAck.upsert({ where: { announcementId_userId: { announcementId, userId: ctx.userId } }, update: {}, create: { announcementId, userId: ctx.userId } });
}

export async function directory(ctx: Ctx) {
  requireScope(ctx, "messaging", "VIEW");
  const people = await db.user.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] }, id: { not: ctx.userId } },
    select: { id: true, name: true, role: { select: { name: true } }, primaryUnit: { select: { code: true } } },
    orderBy: { name: "asc" },
  });
  return people.map((p) => ({ id: p.id, name: p.name, roleName: p.role.name, unit: p.primaryUnit?.code ?? null }));
}

export function canAssignFromChat(ctx: Ctx) {
  const s = scopeOf(ctx, "tasks", "CREATE");
  return s === "ALL" || s === "UNIT";
}
