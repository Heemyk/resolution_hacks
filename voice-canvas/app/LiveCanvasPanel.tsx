"use client";

import { CanvasHost, structuredLog, useSessionSSE } from "@resolution/ui";
import { useEffect, useId } from "react";

interface LiveCanvasPanelProps {
  sessionId?: string;
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
    <div className="h-full w-full flex flex-col bg-[#f5f0e8]">
      <div className="px-4 py-2.5 border-b border-[#E8DDD8] shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#2C2420]/40">
          Canvas
        </span>
        <span className={`text-[10px] font-medium ${connected ? "text-[#B47C69]" : "text-[#D8CECA]"}`}>
          {connected ? "live" : "connecting…"}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <CanvasHost sessionId={sessionId} apiBase={apiBase} lastEvent={last} />
      </div>
    </div>
  );
}
