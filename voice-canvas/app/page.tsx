import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-2 font-[family-name:var(--font-geist-sans)]">
        Voice Canvas
      </h1>
      <p className="text-sm text-foreground/60 mb-8">
        Real-time voice conversation with Gemini
      </p>
      <Link
        href="/voice"
        className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        Start Voice Chat
      </Link>
    </main>
  );
}
