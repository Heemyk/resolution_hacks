"use client";

import { useEffect, useRef, useState } from "react";

export type SSEMessage = {
  event: string;
  data: unknown;
};

/**
 * Subscribe to backend `/api/sse/stream` for a session (Redis-backed fan-out).
 */
export function useSessionSSE(apiBase: string, sessionId: string | null) {
  const [last, setLast] = useState<SSEMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const url = `${apiBase.replace(/\/$/, "")}/api/sse/stream?session_id=${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    const onAny = (event: string) => (ev: MessageEvent) => {
      try {
        const data = ev.data ? JSON.parse(ev.data) : null;
        setLast({ event, data });
      } catch {
        setLast({ event, data: ev.data });
      }
    };
    es.addEventListener("transcript", onAny("transcript"));
    es.addEventListener("render", onAny("render"));
    es.addEventListener("agent_log", onAny("agent_log"));
    es.addEventListener("ping", onAny("ping"));
    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [apiBase, sessionId]);

  return { last, connected };
}
