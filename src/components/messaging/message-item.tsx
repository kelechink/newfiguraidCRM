"use client";

import { CornerUpLeft, KanbanSquare, Pin, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { formatTime } from "@/lib/format";
import type { ChatMessageDto } from "@/server/modules/messaging/service";
import { Avatar } from "@/ui/avatar";
import { cn } from "@/ui/cn";
import { StatusBadge } from "@/ui/status";

/** Renders text with @mentions highlighted. Plain text only — never HTML (Security #5). */
function Body({ text, members }: { text: string; members: { id: string; name: string }[] }) {
  if (!text) return null;
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent-ink">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function MessageItem({
  m,
  compact,
  me,
  members,
  seen,
  canTask,
  onReply,
  onTask,
  onPin,
  onDelete,
}: {
  m: ChatMessageDto;
  compact: boolean;
  me: string;
  members: { id: string; name: string }[];
  seen?: string | null;
  canTask: boolean;
  onReply?: () => void;
  onTask?: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  if (m.kind === "system") {
    return <p className="my-1.5 text-center text-2xs text-ink-3">{m.body}</p>;
  }
  return (
    <div className={cn("group relative flex gap-3 rounded-lg px-3 py-1 hover:bg-surface-2/60", !compact && "mt-2.5", m.isPinned && "bg-warning/5")}>
      <div className="w-8 shrink-0">{!compact && <Avatar id={m.author.id} name={m.author.name} size={32} />}</div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{m.author.name}</span>
            <span className="text-2xs text-ink-3 tabular">{formatTime(new Date(m.createdAt))}</span>
            {m.isPinned && <Pin className="size-3 text-warning" aria-label="Pinned" />}
          </p>
        )}
        {m.deleted ? (
          <p className="text-[13px] italic text-ink-3">Message deleted</p>
        ) : (
          <>
            {m.body && (
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45]">
                <Body text={m.body} members={members} />
              </p>
            )}
            {m.attachments.map((a) =>
              a.mime.startsWith("image/") ? (
                <a key={a.fileId} href={a.url} target="_blank" rel="noreferrer" className="mt-1.5 block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="max-h-64 max-w-[min(100%,360px)] rounded-lg border border-line object-cover" />
                </a>
              ) : a.mime.startsWith("audio/") ? (
                <audio key={a.fileId} controls src={a.url} className="mt-1.5 h-10 w-full max-w-[320px]" preload="none" />
              ) : (
                <a key={a.fileId} href={a.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] hover:border-line-strong">
                  📎 {a.name}
                </a>
              ),
            )}
            {m.task && (
              <Link href={`/work/tasks?task=${m.task.id}`} className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] hover:border-line-strong">
                <KanbanSquare className="size-3.5 text-accent" /> Task{m.task.assignee && ` · ${m.task.assignee}`} <StatusBadge status={m.task.status} />
              </Link>
            )}
          </>
        )}
        {m.replyCount > 0 && onReply && (
          <button onClick={onReply} className="mt-1 text-2xs font-medium text-accent hover:underline">
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
        {seen && <p className="mt-0.5 text-right text-2xs text-ink-3">{seen}</p>}
      </div>
      {!m.deleted && (
        <div className="absolute -top-3 right-3 hidden items-center rounded-md border border-line bg-surface shadow-card group-hover:flex group-focus-within:flex">
          {onReply && (
            <button onClick={onReply} className="p-1.5 text-ink-3 hover:text-ink" aria-label="Reply in thread" title="Reply in thread">
              <CornerUpLeft className="size-3.5" />
            </button>
          )}
          {canTask && !m.task && onTask && (
            <button onClick={onTask} className="p-1.5 text-ink-3 hover:text-ink" aria-label="Make this a task" title="Make this a task">
              <KanbanSquare className="size-3.5" />
            </button>
          )}
          <button onClick={onPin} className="p-1.5 text-ink-3 hover:text-ink" aria-label={m.isPinned ? "Unpin" : "Pin"} title={m.isPinned ? "Unpin" : "Pin"}>
            <Pin className="size-3.5" />
          </button>
          {m.author.id === me && (
            <button onClick={onDelete} className="p-1.5 text-ink-3 hover:text-danger" aria-label="Delete" title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
