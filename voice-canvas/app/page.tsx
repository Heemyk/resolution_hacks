import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#f5f0e8]">
      <Image
        src="/voice_canvas_logo.png"
        alt="Voice Canvas"
        width={80}
        height={80}
        className="mb-8 opacity-90"
      />
      <h1 className="text-2xl font-semibold tracking-tight text-[#2C2420] mb-2">
        Voice Canvas
      </h1>
      <p className="text-sm text-[#2C2420]/50 mb-10">
        Speak a course concept, watch it render live.
      </p>
      <Link
        href="/voice"
        className="px-8 py-3 bg-[#2C2420] text-[#f5f0e8] text-sm font-medium tracking-wide hover:bg-[#3D302B] transition-colors"
      >
        Start Session
      </Link>
    </main>
  );
}
