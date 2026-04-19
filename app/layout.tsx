import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500"],
  variable: "--font-deva",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VAANI — Speech to ISL",
  description:
    "Real-time spoken English to Indian Sign Language on a 3D avatar. Hack Helix 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} ${devanagari.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-[color:var(--vaani-bg-deep)] text-[color:var(--vaani-text)] font-sans">
        {children}
      </body>
    </html>
  );
}
