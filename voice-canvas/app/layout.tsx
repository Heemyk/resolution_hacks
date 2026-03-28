import type { Metadata } from "next";
import { Trispace } from "next/font/google";
import "./globals.css";

const trispace = Trispace({
  variable: "--font-trispace",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Voice Canvas",
  description: "Real-time voice conversation with Gemini Live API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${trispace.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
