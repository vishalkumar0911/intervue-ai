// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

import { Inter, JetBrains_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono  = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://intervue.local"),
  title: { default: "Intervue.AI", template: "%s • Intervue.AI" },
  description: "AI-powered mock interviews with feedback on content, delivery, and non-verbal cues.",
  applicationName: "Intervue.AI",
  keywords: ["mock interview","interview practice","AI interview","Whisper","GPT-4","FastAPI","Next.js"],
  openGraph: {
    type: "website",
    url: "https://intervue.local",
    title: "Intervue.AI",
    description: "Practice role-specific interviews and get instant, actionable feedback.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Intervue.AI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Intervue.AI",
    description: "AI-powered mock interviews.",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  alternates: { canonical: "https://intervue.local" },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#0b0f1a" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body
        className={[
          inter.variable,
          mono.variable,
          "antialiased min-h-dvh pt-safe",
          "bg-white text-slate-900",
          "dark:bg-[#0b0f1a] dark:text-white",
        ].join(" ")}
      >
        {/* Background layers */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
          <div className="absolute inset-0 opacity-[.35] dark:opacity-100 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(99,102,241,.20),transparent_60%)]" />
          <div className="absolute inset-0 opacity-[.35] dark:opacity-100 bg-[radial-gradient(40%_60%_at_20%_10%,rgba(99,102,241,.35),transparent_60%),radial-gradient(35%_55%_at_80%_20%,rgba(34,211,238,.25),transparent_60%)]" />
          <div className="absolute inset-0 hidden md:block opacity-[.25] dark:opacity-100 bg-[linear-gradient(to_right,rgba(0,0,0,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:28px_28px]" />
        </div>

        {/* All client providers (Auth, Theme, Sidebar, etc.) */}
        <Providers>
          <Navbar />
          <main id="main" className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8 py-6">
            {children}
          </main>
          <Footer />
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
