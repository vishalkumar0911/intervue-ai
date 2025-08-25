"use client";
 
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
      <section className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-400" />
          <h2 className="text-2xl font-semibold">Intervue.AI</h2>
        </div>

        <p className="text-white/70">
          AI-powered mock interviews with instant feedback on content, delivery, and non-verbal cues.
        </p>

        <div className="mt-4 flex gap-2">
          <Badge>New</Badge>
          <Badge variant="neutral">Node 20 · Tailwind 3</Badge>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <Link href="/interview">
            <Button>Start Interview</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">Dashboard</Button>
          </Link>
        </motion.div>
      </section>

      <footer className="row-start-3 flex flex-wrap items-center justify-center gap-6 px-4 pb-8">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/file.svg" alt="File icon" width={16} height={16} />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/window.svg" alt="Window icon" width={16} height={16} />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/globe.svg" alt="Globe icon" width={16} height={16} />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
