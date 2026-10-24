import { getCtx } from "@/server/auth/session";
import { subscribe } from "@/server/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events: live notifications, chat, inbox and board updates for the signed-in user. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "hello" });
      const off = subscribe(ctx.userId, send);
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
      cleanup = () => {
        off();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
