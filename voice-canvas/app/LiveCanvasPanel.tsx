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
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        SSE:{" "}
        <span className={connected ? "text-emerald-600" : "text-amber-600"}>
          {connected ? "connected" : "connecting…"}
        </span>
      </p>
      <CanvasHost sessionId={sessionId} apiBase={apiBase} lastEvent={last} />
    </div>
  );
}
