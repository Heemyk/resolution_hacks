import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-3xl font-bold mb-2">Voice Canvas</h1>
      <p className="text-sm text-foreground/60 mb-8">
        Speak a concept — watch it render live.
      </p>
      <Link
        href="/voice"
        className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        Start Voice Session
      </Link>
    </main>
  );
}
