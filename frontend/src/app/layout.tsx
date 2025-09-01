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
          "font-sans antialiased",
          "min-h-screen min-h-dvh",
          // tokenized colors (globals.css defines the CSS vars)
          "bg-background text-foreground",
          // better text selection
          "selection:bg-primary/20 selection:text-primary-foreground",
          // safe-area padding on iOS
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        ].join(" ")}
      >
        {/* Skip link for accessibility */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3
                     focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground"
        >
          Skip to content
        </a>

        {/* Background: subtle grid + spotlight, consistent in light & dark */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div
            className="absolute inset-0 bg-grid bg-[size:28px_28px]
                       opacity-[.04] dark:opacity-[.06]
                       [--grid-color:theme(colors.slate.900)]
                       dark:[--grid-color:theme(colors.white)]"
          />
          <div
            className="absolute inset-0 bg-spotlight
                       [--spot-color:theme(colors.brand.500)]
                       opacity-[.18] dark:opacity-[.25]"
          />
        </div>

        {/* Client providers (theme, auth, etc.) */}
        <Providers>
          <Navbar />
          <main id="main" className="container py-6 md:py-8">
            {children}
          </main>
          <Footer />
          <Toaster position="top-right" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
