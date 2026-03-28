import VoiceChat from "@/app/components/voice-chat";

export default function Home() {
  return (
    <main className="flex flex-col items-center min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-2 font-[family-name:var(--font-geist-sans)]">
        Voice Canvas
      </h1>
      <p className="text-sm text-foreground/60 mb-8">
        Real-time voice conversation with Gemini
      </p>
      <VoiceChat />
    </main>
  );
}
