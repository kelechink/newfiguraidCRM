"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type LiveEvent = { type: string; [k: string]: unknown };
type Listener = (e: LiveEvent) => void;

const LiveContext = createContext<{ on: (fn: Listener) => () => void }>({ on: () => () => {} });

/** One EventSource per tab; components subscribe with useLive(). Reconnects automatically. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as LiveEvent;
          for (const fn of listeners.current) fn(e);
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        retry = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, []);
  return (
    <LiveContext.Provider value={{ on: (fn) => (listeners.current.add(fn), () => listeners.current.delete(fn)) }}>{children}</LiveContext.Provider>
  );
}

export function useLive(fn: Listener, deps: unknown[] = []) {
  const { on } = useContext(LiveContext);
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => on((e) => ref.current(e)), [on, ...deps]);
}
