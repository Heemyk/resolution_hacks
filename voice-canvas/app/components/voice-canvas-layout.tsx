"use client";

import { useId } from "react";
import VoiceChat from "./voice-chat";
import { LiveCanvasPanel } from "../LiveCanvasPanel";

export function VoiceCanvasLayout() {
  const reactId = useId();
  const sessionId = `session-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="h-full w-full grid grid-cols-2 bg-[#f5f0e8]">
      {/* Left: voice + transcript */}
      <div className="h-full border-r border-[#E8DDD8] overflow-hidden">
        <VoiceChat sessionId={sessionId} />
      </div>

      {/* Right: live canvas */}
      <div className="h-full overflow-hidden">
        <LiveCanvasPanel sessionId={sessionId} />
      </div>
    </div>
  );
}
