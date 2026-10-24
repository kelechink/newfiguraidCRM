import "server-only";
import { EventEmitter } from "node:events";

// In-process event bus feeding the /api/events SSE stream. Figuraid OS runs as a
// single web process on the VPS, so this is enough; if it ever scales to several
// instances, swap the emitter for Postgres LISTEN/NOTIFY behind the same API.

export type LiveEvent =
  | { type: "notification"; id: string; title: string; body?: string | null; link?: string | null }
  | { type: "chat"; channelId: string; messageId: string }
  | { type: "chat.read"; channelId: string; userId: string }
  | { type: "inbox"; conversationId: string }
  | { type: "task"; taskId: string }
  | { type: "dashboard" };

const g = globalThis as unknown as { __fosBus?: EventEmitter };
const bus = (g.__fosBus ??= new EventEmitter().setMaxListeners(0));

export function publish(userIds: string[], event: LiveEvent) {
  for (const id of new Set(userIds)) bus.emit(`user:${id}`, event);
}

export function subscribe(userId: string, fn: (e: LiveEvent) => void): () => void {
  bus.on(`user:${userId}`, fn);
  return () => bus.off(`user:${userId}`, fn);
}
