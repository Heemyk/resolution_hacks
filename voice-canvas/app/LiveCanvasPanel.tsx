"use client";

import { CanvasHost, structuredLog, useSessionSSE } from "@resolution/ui";
import { useEffect, useId } from "react";

interface LiveCanvasPanelProps {
  sessionId?: string;
  connected?: boolean;
}

export function LiveCanvasPanel({ sessionId: externalSessionId }: LiveCanvasPanelProps = {}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  const fallbackId = useId();
  const sessionId =
    externalSessionId ?? `demo-${fallbackId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const { last, connected } = useSessionSSE(apiBase, sessionId);

  useEffect(() => {
    structuredLog("info", "LiveCanvasPanel", "panel.mount", {
      sessionId,
      apiBase,
      externalSessionId: externalSessionId ?? null,
    });
  }, [sessionId, apiBase, externalSessionId]);

  useEffect(() => {
    structuredLog("debug", "LiveCanvasPanel", "sse.connection_state", { sessionId, connected });
  }, [sessionId, connected]);

  return (
    <div className="h-full w-full relative">
      {/* SSE status dot */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 pointer-events-none">
        <div
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-400"}`}
        />
        <span className="text-[10px] font-mono" style={{ color: "var(--muted-foreground)" }}>
          {connected ? "live" : "connecting"}
        </span>
      </div>
      <CanvasHost sessionId={sessionId} apiBase={apiBase} lastEvent={last} />
    </div>
  );
}
