"use client";

import { useEffect, useRef, useState } from "react";
import { safeJson, structuredLog } from "../logger";

export type SSEMessage = {
  event: string;
  data: unknown;
};

/**
 * Subscribe to backend `/api/sse/stream` for a session (in-memory fan-out).
 */
export function useSessionSSE(apiBase: string, sessionId: string | null) {
  const [last, setLast] = useState<SSEMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const base = apiBase.replace(/\/$/, "");
    const url = `${base}/api/sse/stream?session_id=${encodeURIComponent(sessionId)}`;
    structuredLog("info", "useSessionSSE", "sse.connect_attempt", { sessionId, url, apiBase: base });
    const es = new EventSource(url);
    esRef.current = es;
    es.onopen = () => {
      structuredLog("info", "useSessionSSE", "sse.open", { sessionId, url });
      setConnected(true);
    };
    es.onerror = () => {
      structuredLog("warn", "useSessionSSE", "sse.error", {
        sessionId,
        url,
        readyState: es.readyState,
      });
      setConnected(false);
    };
    const onAny =
      (eventName: string) =>
      (ev: MessageEvent) => {
        let data: unknown;
        try {
          data = ev.data ? JSON.parse(ev.data) : null;
        } catch {
          data = ev.data;
        }
        structuredLog("info", "useSessionSSE", "sse.event", {
          sessionId,
          sse_event: eventName,
          data,
          raw_data: typeof ev.data === "string" ? ev.data : safeJson(ev.data),
        });
        setLast({ event: eventName, data });
      };
    es.addEventListener("transcript", onAny("transcript"));
    es.addEventListener("render", onAny("render"));
    es.addEventListener("agent_log", onAny("agent_log"));
    es.addEventListener("ping", onAny("ping"));
    return () => {
      structuredLog("info", "useSessionSSE", "sse.close", { sessionId, url });
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [apiBase, sessionId]);

  return { last, connected };
}
