"use client";

import { ArrowLeft, Hash, Megaphone, MessageSquarePlus, Pin, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ago, formatDay } from "@/lib/format";
import {
  createGroupAction,
  deleteMessageAction,
  listChannelsAction,
  listMessagesAction,
  markReadAction,
  messageToTaskAction,
  openDirectAction,
  togglePinAction,
} from "@/server/modules/messaging/actions";
import type { ChatMessageDto } from "@/server/modules/messaging/service";
import type { AssignableUser } from "@/server/modules/users/service";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";
import { useLive } from "../shell/live";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";

type Channel = Extract<Awaited<ReturnType<typeof listChannelsAction>>, { ok: true }>["data"][number];
type Thread = Extract<Awaited<ReturnType<typeof listMessagesAction>>, { ok: true }>["data"];
type Person = { id: string; name: string; roleName: string; unit: string | null };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(new Date(Date.now() - 86_400_000))) return "Yesterday";
  return formatDay(d, { weekday: true });
}

function MessageList({ thread, me, canTask, onReply, onTask, reload }: { thread: Thread; me: string; canTask: boolean; onReply?: (m: ChatMessageDto) => void; onTask: (m: ChatMessageDto) => void; reload: () => void }) {
  const toast = useToast();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [thread.messages.length, thread.channel.id]);
  const others = thread.channel.members.filter((x) => x.id !== me);
  const lastMine = [...thread.messages].reverse().find((m) => m.author.id === me && m.kind !== "system");
  const seenText = (m: ChatMessageDto) => {
    if (m.id !== lastMine?.id) return null;
    const seen = others.filter((o) => o.lastReadAt && o.lastReadAt >= m.createdAt);
    if (thread.channel.type === "DIRECT") return seen.length ? "Seen" : "Sent";
    return seen.length ? `Seen by ${seen.length}` : null;
  };
  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) toast({ tone: "error", title: r.error ?? "Failed" });
    reload();
  };

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto py-3">
      {thread.messages.length === 0 && <p className="px-6 py-16 text-center text-[13px] text-ink-3">No messages yet. Say hello 👋</p>}
      {thread.messages.map((m, i) => {
        const prev = thread.messages[i - 1];
        const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
        const compact = !newDay && !!prev && prev.author.id === m.author.id && prev.kind !== "system" && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex items-center gap-3 px-4 text-2xs font-medium text-ink-3">
                <span className="h-px flex-1 bg-line" />
                {dayLabel(m.createdAt)}
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <MessageItem
              m={m}
              compact={compact}
              me={me}
              members={thread.channel.members}
              seen={seenText(m)}
              canTask={canTask}
              onReply={onReply ? () => onReply(m) : undefined}
              onTask={() => onTask(m)}
              onPin={() => act(togglePinAction(m.id))}
              onDelete={() => act(deleteMessageAction(m.id))}
            />
          </div>
        );
      })}
      <div ref={bottom} />
    </div>
  );
}

function TaskFromMessage({ msg, assignable, units, onClose }: { msg: ChatMessageDto; assignable: AssignableUser[]; units: { id: string; name: string }[]; onClose: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const people = assignable.filter((a) => a.unitIds.includes(unitId));
  const make = useAction(messageToTaskAction, { success: "Task created and posted in the thread", onSuccess: onClose, refresh: false });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Make this a task"
        description="It lands on the assignee's board; progress is posted back here."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="msg-task" loading={make.pending}>Create task</Button>
          </>
        }
      >
        <form
          id="msg-task"
          className="grid gap-4"
          action={make.formAction((f) => ({
            messageId: msg.id,
            title: f.get("title"),
            unitId,
            assigneeId: f.get("assigneeId"),
            priority: f.get("priority"),
            dueAt: f.get("due") ? `${f.get("due")}T17:00:00+01:00` : undefined,
          }))}
        >
          <Field label="Title" htmlFor="mt-title" error={make.errors.title}>
            <Input id="mt-title" name="title" defaultValue={msg.body.split("\n")[0]?.slice(0, 120)} required autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unit" htmlFor="mt-unit">
              <Select id="mt-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="mt-who">
              <Select id="mt-who" name="assigneeId" required defaultValue={people.find((p) => p.id === msg.author.id)?.id ?? ""} key={unitId}>
                <option value="" disabled>Choose a person</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due" htmlFor="mt-due"><Input id="mt-due" name="due" type="date" /></Field>
            <Field label="Priority" htmlFor="mt-pri">
              <Select id="mt-pri" name="priority" defaultValue="MEDIUM">
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
              </Select>
            </Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewConversation({ people, onClose, onOpen }: { people: Person[]; onClose: () => void; onOpen: (id: string) => void }) {
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const dm = useAction(openDirectAction, { refresh: false, onSuccess: (r) => onOpen(r.id) });
  const group = useAction(createGroupAction, { refresh: false, success: "Group created", onSuccess: (r) => onOpen(r.id) });
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={mode === "dm" ? "New message" : "New group"}
        footer={
          mode === "group" ? (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" form="grp" loading={group.pending} disabled={!picked.length}>Create group</Button>
            </>
          ) : undefined
        }
      >
        <div className="mb-3 flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
          {(["dm", "group"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("h-7 flex-1 rounded-md text-[12.5px] font-medium", mode === m ? "bg-surface shadow-card" : "text-ink-3")}>
              {m === "dm" ? "Direct message" : "Group"}
            </button>
          ))}
        </div>
        <form id="grp" className="grid gap-3" action={group.formAction((f) => ({ name: f.get("name"), memberIds: picked }))}>
          {mode === "group" && <Input name="name" placeholder="Group name, e.g. Akwa Ibom bid team" required aria-label="Group name" />}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" autoFocus />
          <ul className="scrollbar-thin max-h-72 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => (mode === "dm" ? dm.run(p.id) : setPicked((xs) => (xs.includes(p.id) ? xs.filter((x) => x !== p.id) : [...xs, p.id])))}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface-2", picked.includes(p.id) && "bg-accent-soft")}
                >
                  <Avatar id={p.id} name={p.name} size={26} />
                  <span className="flex-1 text-[13px]">{p.name}</span>
                  <span className="text-2xs text-ink-3">{p.roleName}{p.unit && ` · ${UNIT_STYLE[p.unit]?.label}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Messenger({ me, people, canTask, assignable, units, pendingAcks }: { me: string; people: Person[]; canTask: boolean; assignable: AssignableUser[]; units: { id: string; name: string }[]; pendingAcks: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(params.get("c"));
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [replies, setReplies] = useState<Thread | null>(null);
  const [taskFor, setTaskFor] = useState<ChatMessageDto | null>(null);
  const [newConv, setNewConv] = useState(false);

  const loadChannels = useCallback(async () => {
    const r = await listChannelsAction();
    if (r.ok) setChannels(r.data);
  }, []);
  const loadThread = useCallback(async (id: string) => {
    const r = await listMessagesAction({ channelId: id });
    if (r.ok) {
      setThread(r.data);
      void markReadAction(id).then(loadChannels);
    }
  }, [loadChannels]);
  const loadReplies = useCallback(async (channelId: string, parentId: string) => {
    const r = await listMessagesAction({ channelId, parentId });
    if (r.ok) setReplies(r.data);
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);
  useEffect(() => {
    if (!active && channels.length && window.innerWidth >= 1024) setActive(channels[0]!.id);
  }, [channels, active]);
  useEffect(() => {
    setReplyTo(null);
    setReplies(null);
    if (active) void loadThread(active);
  }, [active, loadThread]);

  useLive((e) => {
    if (e.type === "chat" || e.type === "chat.read") {
      if (active && e.channelId === active) {
        void loadThread(active);
        if (replyTo) void loadReplies(active, replyTo.id);
      } else void loadChannels();
    }
  }, [active, replyTo]);

  const open = (id: string) => {
    setNewConv(false);
    setActive(id);
    router.replace(`/work/messages?c=${id}`, { scroll: false });
    void loadChannels();
  };
  const current = useMemo(() => channels.find((c) => c.id === active), [channels, active]);
  const groups = channels.filter((c) => c.type !== "DIRECT");
  const dms = channels.filter((c) => c.type === "DIRECT");

  const ChannelRow = ({ c }: { c: Channel }) => (
    <li>
      <button onClick={() => open(c.id)} className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left", c.id === active ? "bg-surface shadow-card ring-1 ring-line" : "hover:bg-surface-3/60")}>
        {c.type === "DIRECT" ? (
          <Avatar id={c.otherUserId ?? c.id} name={c.name} size={24} />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-md bg-surface-3 text-ink-3">
            {c.unitCode ? <span className={cn("size-2 rounded-full", UNIT_STYLE[c.unitCode]?.dot)} /> : c.type === "GROUP" ? <Hash className="size-3.5" /> : <Users className="size-3.5" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px]", c.unread ? "font-semibold" : "font-medium")}>{c.name}</span>
          {c.preview && <span className="block truncate text-2xs text-ink-3">{c.preview}</span>}
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] text-ink-3">{ago(c.lastAt)}</span>
          {c.unread > 0 && <span className="min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[10px] font-bold leading-[18px] text-white tabular">{c.unread}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="-mx-4 -my-5 flex h-[calc(100dvh-48px)] overflow-hidden border-line sm:-mx-6 lg:-mx-8 lg:-my-7 lg:h-dvh">
      <aside className={cn("w-full shrink-0 flex-col border-r border-line bg-surface-2/40 lg:flex lg:w-[300px]", active ? "hidden" : "flex")}>
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <h1 className="text-[15px] font-semibold">Messages</h1>
          <Button size="sm" variant="secondary" onClick={() => setNewConv(true)}>
            <MessageSquarePlus className="size-3.5" /> New
          </Button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          <Link href="/work/announcements" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium hover:bg-surface-3/60">
            <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent-ink"><Megaphone className="size-3.5" /></span>
            Announcements
            {pendingAcks > 0 && <span className="ml-auto min-w-[18px] rounded-full bg-danger px-1.5 text-center text-[10px] font-bold leading-[18px] text-white tabular">{pendingAcks}</span>}
          </Link>
          <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-[0.06em] text-ink-3">Channels</p>
          <ul className="grid gap-px">{groups.map((c) => <ChannelRow key={c.id} c={c} />)}</ul>
          <p className="px-2 pb-1 pt-4 text-2xs font-medium uppercase tracking-[0.06em] text-ink-3">Direct messages</p>
          <ul className="grid gap-px">{dms.map((c) => <ChannelRow key={c.id} c={c} />)}</ul>
          {dms.length === 0 && <p className="px-2 py-2 text-2xs text-ink-3">Start a conversation with “New”.</p>}
        </div>
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col bg-surface", active ? "flex" : "hidden lg:flex")}>
        {thread && current ? (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
              <button className="-ml-1 rounded-md p-1 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setActive(null)} aria-label="Back to conversations">
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{thread.channel.type === "DIRECT" ? thread.channel.name : `# ${thread.channel.name}`}</p>
                <p className="text-2xs text-ink-3">{thread.channel.members.length} member{thread.channel.members.length === 1 ? "" : "s"}</p>
              </div>
            </header>
            {thread.pinned.length > 0 && (
              <div className="flex items-center gap-2 border-b border-line bg-warning/5 px-4 py-1.5 text-2xs">
                <Pin className="size-3 shrink-0 text-warning" />
                <span className="truncate"><b className="font-semibold">{thread.pinned[0]!.author}:</b> {thread.pinned[0]!.body}</span>
                {thread.pinned.length > 1 && <span className="shrink-0 text-ink-3">+{thread.pinned.length - 1} more</span>}
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <MessageList
                  thread={thread}
                  me={me}
                  canTask={canTask}
                  onReply={(m) => {
                    setReplyTo(m);
                    void loadReplies(thread.channel.id, m.id);
                  }}
                  onTask={setTaskFor}
                  reload={() => loadThread(thread.channel.id)}
                />
                <Composer channelId={thread.channel.id} members={thread.channel.members} me={me} placeholder={`Message ${thread.channel.type === "DIRECT" ? thread.channel.name : `#${thread.channel.name}`}`} onSent={() => loadThread(thread.channel.id)} />
              </div>
              {replyTo && (
                <aside className="fixed inset-0 z-40 flex flex-col bg-surface md:static md:z-auto md:w-[360px] md:border-l md:border-line">
                  <header className="flex h-12 items-center justify-between border-b border-line px-4">
                    <p className="text-[13px] font-semibold">Thread</p>
                    <button onClick={() => (setReplyTo(null), setReplies(null))} className="rounded p-1 text-ink-3 hover:bg-surface-2" aria-label="Close thread"><X className="size-4" /></button>
                  </header>
                  <div className="border-b border-line">
                    <MessageItem m={replyTo} compact={false} me={me} members={thread.channel.members} canTask={false} onPin={() => {}} onDelete={() => {}} />
                  </div>
                  {replies ? (
                    <MessageList thread={replies} me={me} canTask={canTask} onTask={setTaskFor} reload={() => loadReplies(thread.channel.id, replyTo.id)} />
                  ) : (
                    <div className="flex-1" />
                  )}
                  <Composer channelId={thread.channel.id} parentId={replyTo.id} members={thread.channel.members} me={me} placeholder="Reply…" onSent={() => (loadReplies(thread.channel.id, replyTo.id), loadThread(thread.channel.id))} />
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-ink-3">Pick a conversation</div>
        )}
      </section>

      {newConv && <NewConversation people={people} onClose={() => setNewConv(false)} onOpen={open} />}
      {taskFor && <TaskFromMessage msg={taskFor} assignable={assignable} units={units} onClose={() => (setTaskFor(null), active && loadThread(active))} />}
    </div>
  );
}
