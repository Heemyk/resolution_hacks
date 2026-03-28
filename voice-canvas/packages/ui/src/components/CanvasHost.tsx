"use client";

import { useEffect } from "react";
import type { SSEMessage } from "../hooks/useSessionSSE";
import { structuredLog } from "../logger";

type Props = {
  sessionId: string;
  apiBase: string;
  lastEvent: SSEMessage | null;
};

/**
 * Renders agent-driven canvas blocks (A2UI-style). Map `render` events to diagrams / components.
 */
export function CanvasHost({ sessionId, apiBase, lastEvent }: Props) {
  useEffect(() => {
    if (!lastEvent) return;
    structuredLog("debug", "CanvasHost", "canvas.last_event", {
      sessionId,
      apiBase,
      sse_event: lastEvent.event,
      data: lastEvent.data,
    });
  }, [sessionId, apiBase, lastEvent]);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
      aria-label="Live canvas"
    >
      <header className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Session <code className="text-zinc-900 dark:text-zinc-100">{sessionId}</code>
      </header>
      <p className="text-xs text-zinc-500">
        API: <code>{apiBase}</code>
      </p>
      <pre className="mt-3 max-h-64 overflow-auto text-xs text-zinc-800 dark:text-zinc-200">
        {lastEvent ? JSON.stringify(lastEvent, null, 2) : "Waiting for SSE…"}
      </pre>
    </section>
  );
}
