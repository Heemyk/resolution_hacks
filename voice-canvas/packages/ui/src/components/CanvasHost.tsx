"use client";

import { useEffect, useState } from "react";
import type { SSEMessage } from "../hooks/useSessionSSE";
import { structuredLog } from "../logger";
import { ChartBlock } from "./ChartBlock";

type UIBlock = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
};

type Props = {
  sessionId: string;
  apiBase: string;
  lastEvent: SSEMessage | null;
};

/**
 * Renders agent-driven canvas blocks (A2UI-style). Map `render` events to diagrams / components.
 */
export function CanvasHost({ sessionId, apiBase, lastEvent }: Props) {
  const [blocks, setBlocks] = useState<UIBlock[]>([]);

  useEffect(() => {
    if (!lastEvent) return;
    structuredLog("debug", "CanvasHost", "canvas.last_event", {
      sessionId,
      apiBase,
      sse_event: lastEvent.event,
    });
    if (lastEvent.event !== "render") return;
    const job = (lastEvent.data as any)?.job;
    if (!Array.isArray(job?.blocks)) return;
    setBlocks(job.blocks);
  }, [sessionId, apiBase, lastEvent]);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 h-full overflow-auto"
      aria-label="Live canvas"
    >
      <header className="mb-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Session <code className="text-zinc-900 dark:text-zinc-100">{sessionId}</code>
      </header>

      {blocks.length === 0 ? (
        <p className="text-xs text-zinc-400">Waiting for agent response…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
      )}
    </section>
  );
}

function BlockRenderer({ block }: { block: UIBlock }) {
  if (block.kind === "markdown") {
    return (
      <pre className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200 font-sans">
        {String(block.payload.text ?? "")}
      </pre>
    );
  }

  if (block.kind === "chartjs") {
    const config = block.payload.config;
    if (!config || typeof config !== "object") return null;
    return <ChartBlock config={config as object} />;
  }

  if (block.kind === "mermaid") {
    return (
      <pre className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-900 rounded p-2 overflow-auto">
        {String(block.payload.source ?? "")}
      </pre>
    );
  }

  return (
    <pre className="text-xs text-zinc-400 overflow-auto">
      {JSON.stringify(block.payload, null, 2)}
    </pre>
  );
}
