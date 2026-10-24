"use client";

import { Mic, Paperclip, SendHorizontal, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendMessageAction } from "@/server/modules/messaging/actions";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { useToast } from "@/ui/toast";

type Member = { id: string; name: string };

export function Composer({ channelId, parentId, members, me, placeholder, onSent }: { channelId: string; parentId?: string; members: Member[]; me: string; placeholder: string; onSent: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<Member[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<{ rec: MediaRecorder; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - recording.started) / 1000)), 500);
    return () => clearInterval(t);
  }, [recording]);

  const candidates = mentionQuery === null ? [] : members.filter((m) => m.id !== me && m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  const send = async (extra?: { voice: Blob; seconds: number }) => {
    if (sending) return;
    if (!body.trim() && !files.length && !extra) return;
    setSending(true);
    const f = new FormData();
    f.set("channelId", channelId);
    if (parentId) f.set("parentId", parentId);
    f.set("body", body);
    for (const m of mentioned) if (body.includes(`@${m.name}`)) f.append("mentionIds", m.id);
    for (const file of files) f.append("files", file);
    if (extra) {
      f.append("files", new File([extra.voice], "voice-note.webm", { type: extra.voice.type || "audio/webm" }));
      f.set("durationSec", String(extra.seconds));
    }
    const res = await sendMessageAction(f);
    setSending(false);
    if (!res.ok) return toast({ tone: "error", title: res.error });
    setBody("");
    setFiles([]);
    setMentioned([]);
    onSent();
    area.current?.focus();
  };

  const onChange = (v: string) => {
    setBody(v);
    const caret = area.current?.selectionStart ?? v.length;
    const m = /@([\w ]{0,20})$/.exec(v.slice(0, caret));
    setMentionQuery(m ? m[1]! : null);
  };

  const pick = (m: Member) => {
    const caret = area.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w ]{0,20})$/, `@${m.name} `);
    setBody(before + body.slice(caret));
    setMentioned((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    setMentionQuery(null);
    area.current?.focus();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const started = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = Math.round((Date.now() - started) / 1000);
        if (seconds >= 1) void send({ voice: new Blob(chunks, { type: rec.mimeType }), seconds });
      };
      rec.start();
      setRecording({ rec, started });
      setElapsed(0);
    } catch {
      toast({ tone: "error", title: "Microphone blocked", body: "Allow microphone access to send voice notes." });
    }
  };

  return (
    <div className="relative border-t border-line bg-surface p-3">
      {candidates.length > 0 && (
        <ul className="absolute bottom-full left-3 z-20 mb-1 w-64 rounded-lg border border-line bg-surface p-1 shadow-lift" role="listbox">
          {candidates.map((m) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => (e.preventDefault(), pick(m))} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-2">
                <Avatar id={m.id} name={m.name} size={20} /> {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-2xs">
              📎 {f.name}
              <button type="button" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {recording ? (
        <div className="flex h-10 items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3">
          <span className="size-2 animate-pulse rounded-full bg-danger" />
          <span className="flex-1 text-[13px] tabular">Recording… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
          <Button size="sm" variant="ghost" onClick={() => (recording.rec.onstop = null, recording.rec.stream.getTracks().forEach((t) => t.stop()), recording.rec.stop(), setRecording(null))}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={() => (recording.rec.stop(), setRecording(null))}>
            <Square className="size-3" /> Send
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            ref={area}
            value={body}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && candidates.length === 0) {
                e.preventDefault();
                void send();
              }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            rows={1}
            placeholder={placeholder}
            aria-label="Message"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[13.5px] leading-5 outline-none placeholder:text-ink-3 focus:border-accent/60 focus:ring-[3px] focus:ring-accent/15"
          />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => setFiles((xs) => [...xs, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
          <button type="button" onClick={() => fileInput.current?.click()} className="flex size-10 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Attach a file">
            <Paperclip className="size-4" />
          </button>
          {body.trim() || files.length ? (
            <button
              type="button"
              onClick={() => send()}
              disabled={sending}
              className={cn("flex size-10 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent/90", sending && "opacity-60")}
              aria-label="Send"
            >
              <SendHorizontal className="size-4" />
            </button>
          ) : (
            <button type="button" onClick={startRecording} className="flex size-10 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Record a voice note">
              <Mic className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
