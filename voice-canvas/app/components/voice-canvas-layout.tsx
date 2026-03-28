"use client";

import { useState } from "react";
import VoiceChat from "./voice-chat";
import { LiveCanvasPanel } from "../LiveCanvasPanel";

export function VoiceCanvasLayout() {
  const [sessionId] = useState(
    () => `session-${Math.random().toString(36).slice(2, 10)}`
  );

  return (
    <div className="h-full w-full grid grid-cols-2">
      {/* Left: voice visualizer + transcript */}
      <div className="h-full border-r border-foreground/10 overflow-hidden">
        <VoiceChat sessionId={sessionId} />
      </div>

      {/* Right: live canvas rendered by the agent via SSE */}
      <div className="h-full overflow-hidden">
        <LiveCanvasPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
