// frontend/src/app/(auth)/login/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock } from "lucide-react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
// NOTE: Placeholder components used below as the actual logic for them was not fully provided
// import HeroMetrics from "@/components/HeroMetrics";
// import DemoCTA from "@/components/DemoCTA";
// import FeatureTiles from "@/components/FeatureTiles";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { signIn } from "next-auth/react";

const TAGLINES = [
  "Ready for your next career jump?",
  "Let’s sharpen your interview skills.",
  "Practice, get feedback, and improve fast.",
];

const TESTIMONIALS = [
  {
    quote: "Intervue.AI helped me land multiple offers — the feedback is precise and practical.",
    name: "Amit Sharma",
    meta: "SDE @ Flipkart",
  },
  {
    quote: "The mock interviews felt real. The scoring & tips were exactly what I needed.",
    name: "Ritu Verma",
    meta: "Frontend @ Razorpay",
  },
];

const STAGGER = { when: "beforeChildren", staggerChildren: 0.06 };

// Placeholder components to satisfy type/use (replace if real implementations exist)
const HeroMetrics = () => (
    <div className="flex flex-wrap gap-4 text-center">
      <div><div className="text-3xl font-bold text-foreground">3+</div><div className="text-sm text-muted-foreground">Curated questions</div></div>
      <div><div className="text-3xl font-bold text-foreground">12K+</div><div className="text-sm text-muted-foreground">Interviews completed</div></div>
      <div><div className="text-3xl font-bold text-foreground">500+</div><div className="text-sm text-muted-foreground">Active users</div></div>
    </div>
);
const DemoCTA = () => <Link href="/interview"><Button variant="secondary" className="w-full">Try a 60s demo - no signup</Button></Link>;
const FeatureTiles = () => <div className="hidden lg:block"></div>;
// End placeholders

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; pass?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // rotating tagline
  const [taglineIndex, setTaglineIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTaglineIndex((i) => (i + 1) % TAGLINES.length), 4200);
    return () => clearInterval(id);
  }, []);

  // testimonial carousel
  const [testIndex, setTestIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTestIndex((i) => (i + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function validate() {
    const errs: typeof fieldErrors = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.email = "Please enter a valid email";
    if (!pass || pass.length < 6) errs.pass = "Password must be at least 6 characters";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim(), pass);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (err: any) {
      const msg = err?.message || "Sign in failed";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const testimonial = TESTIMONIALS[testIndex];

  const borderWrapperStyle = useMemo(
    () => ({
      // Gradient border style for elevation
      background:
        "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(79,70,229,0.06)) padding-box," +
        "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(99,102,241,0.5)) border-box",
      borderRadius: "1rem",
      padding: "1px",
    }),
    []
  );

  return (
    <div className="min-h-[88vh] flex items-start md:items-center justify-center">
      <motion.div initial="hidden" animate="show" variants={STAGGER} className="w-full px-4" aria-live="polite">
        {/* Use a centered 3-column layout: left flexible, center fixed, right flexible */}
        <div
          className="mx-auto w-full max-w-8xl grid grid-cols-1 gap-8 items-start
                     lg:items-start lg:gap-10
                     lg:[grid-template-columns:1fr_420px_1fr]"
        >
          {/* LEFT — hero content aligned to the right of its column so it sits next to card */}
          <div className="order-1 lg:order-1 px-2 flex flex-col justify-center gap-6 justify-self-end max-w-[520px]">
            <motion.h1 initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="text-4xl md:text-5xl font-extrabold leading-tight">
              Practice confidently, interview better.
            </motion.h1>

            <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }} className="text-lg text-muted-foreground">
              Intervue.AI simulates role-specific mock interviews (voice + text), analyzes content & delivery using AI, and gives actionable feedback and progress tracking — tailored to your target role.
            </motion.p>

            {/* metrics + CTAs — keep them compact and centered inside the left column area */}
            <div className="mt-4">
              <HeroMetrics />
            </div>

            <div className="mt-4">
              <DemoCTA />
            </div>

            <div className="mt-4">
              <FeatureTiles />
            </div>
          </div>

          {/* CENTER — fixed width column with centered card */}
          <div className="order-3 lg:order-2 flex items-start lg:items-center justify-center justify-self-center">
            <div className="w-full max-w-[420px] min-w-[320px]">
              <div className="relative">
                <div aria-hidden className="absolute -inset-2 -z-10 rounded-2xl" style={{ filter: "blur(28px)", background: "radial-gradient(600px 300px at 30% 10%, rgba(99,102,241,0.08), transparent 30%)" }} />
                <div style={borderWrapperStyle}>
                  <Card className="p-6 md:p-8 rounded-2xl bg-card">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-2xl font-semibold flex items-center gap-2">
                            <span className="inline-flex items-center justify-center rounded-md w-8 h-8 bg-primary/10 text-primary">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2l1.8 4.6L19 9l-4.8 2.1L12 16l-2.2-4.9L5 9l5.2-2.4L12 2z" fill="currentColor" /></svg>
                            </span>
                            Sign in
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">Don’t have an account? <Link href="/signup" className="text-primary underline">Sign up</Link></p>
                        </div>

                        <div className="hidden sm:flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">New?</span>
                          <Link href="/signup" className="text-primary underline">Create account</Link>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-muted-foreground" role="status">
                        {/* Rotating tagline */}
                        <AnimatePresence initial={false} mode="wait">
                          <motion.strong key={taglineIndex} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.3 }}>
                            {TAGLINES[taglineIndex]}
                          </motion.strong>
                        </AnimatePresence>
                      </div>

                      <form onSubmit={onSubmit} aria-busy={loading} className="mt-6 space-y-4" noValidate>
                        <label className="block">
                          <span className="mb-1 block text-sm text-muted-foreground">Email</span>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground"><Mail className="h-4 w-4" /></span>
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" className="pl-10" autoComplete="email" required />
                          </div>
                          {fieldErrors.email && <div className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.email}</div>}
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm text-muted-foreground">Password</span>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground"><Lock className="h-4 w-4" /></span>
                            <Input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" type={showPass ? "text" : "password"} className="pl-10 pr-12" autoComplete="current-password" required />
                            <button type="button" onClick={() => setShowPass((s) => !s)} aria-pressed={showPass} aria-label={showPass ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground focus-ring">
                              {showPass ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 9.5A3.5 3.5 0 0114 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              )}
                            </button>
                          </div>
                          {fieldErrors.pass && <div className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.pass}</div>}
                        </label>

                        <div className="flex items-center justify-between">
                          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <input aria-label="Remember me" type="checkbox" className="rounded-sm accent-primary focus-ring" />
                            <span>Remember me</span>
                          </label>

                          <Link href="/forgot-password" className="text-sm text-muted-foreground underline">Forgot password?</Link>
                        </div>

                        {serverError && <div role="alert" className="text-sm text-destructive">{serverError}</div>}

                        <div className="pt-1">
                          <Button type="submit" isLoading={loading} className="w-full">Sign in</Button>
                        </div>
                      </form>

                      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" /><span>or</span><div className="h-px flex-1 bg-border" /></div>

                      <div className="mt-4 grid gap-3">
                        <Button variant="secondary" onClick={() => signIn("google", { callbackUrl: "/dashboard" }, { prompt: "select_account" })} className="w-full flex items-center justify-center gap-3 py-3">
                          <span className="inline-flex items-center justify-center rounded-full w-7 h-7"><svg width="14" height="14" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.9 0 7 1.4 9.1 3.1l6.8-6.6C35.4 2.9 30.2 0 24 0 14.7 0 6.8 5.5 2.9 13.3l7.9 6.1C12.9 14 18 9.5 24 9.5z"/><path fill="#34A853" d="M46.5 24.5c0-1.4-.1-2.8-.4-4.1H24v8h12.9c-.6 3-2.7 5.5-5.7 7.1l8.6 6.7C44.3 37 46.5 31.6 46.5 24.5z"/></svg></span>
                          <span className="font-medium">Continue with Google</span>
                        </Button>

                        <div className="mt-3 text-xs text-muted-foreground text-center">By continuing, you agree to our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</div>

                        <div className="mt-4 flex items-center justify-center gap-4">
                          {/* Placeholder logos for Amazon, Microsoft, etc. */}
                          <svg width="44" height="28" viewBox="0 0 100 40" aria-hidden><rect x="0" y="6" width="100" height="28" rx="6" fill="rgba(255,255,255,0.02)" /><text x="12" y="25" fill="rgba(255,255,255,0.8)" fontSize="12">Amazon</text></svg>
                          <svg width="44" height="28" viewBox="0 0 40 28" aria-hidden><rect x="0" y="0" width="10" height="10" fill="#f15327"/><rect x="12" y="0" width="10" height="10" fill="#7fc241"/><rect x="0" y="12" width="10" height="10" fill="#00a4ef"/><rect x="12" y="12" width="10" height="10" fill="#ffb900"/></svg>
                          <svg width="44" height="28" viewBox="0 0 80 28" aria-hidden><rect x="0" y="8" width="70" height="6" fill="rgba(255,255,255,0.06)"/></svg>
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground text-center">
                          <span className="inline-flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M12 1.5L3 5v6.5C3 16.44 7.03 20.5 12 20.5s9-4.06 9-9V5l-9-3.5z" fill="currentColor" opacity="0.06"/><path d="M7 11l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>Encrypted and secure — your data stays private</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </Card>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — testimonial & small FAQs aligned to left of its column */}
          <div className="order-2 lg:order-3 px-2 flex flex-col gap-6 justify-self-start max-w-[340px]">
            <div className="flex flex-wrap gap-3 justify-start">
              <Badge pill leadingIcon={<svg width="12" height="12" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>} className="hover:scale-105">AI feedback</Badge>
              <Badge pill leadingIcon={<svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 2l3 6 6 .5-4.5 3 1.5 6L12 15l-6 3 1.5-6L3 8.5 9 8 12 2z" fill="currentColor" /></svg>} className="hover:scale-105">Curated questions</Badge>
              <Badge pill leadingIcon={<svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>} className="hover:scale-105">Real interview mode</Badge>
            </div>

            <div className="rounded-xl border border-border p-4 bg-card/60">
              <strong className="text-sm block mb-2">What learners say</strong>
              <AnimatePresence initial={false} mode="wait">
                <motion.div key={testIndex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.45 }}>
                  <p className="text-sm text-muted-foreground">“{testimonial.quote}”</p>
                  <div className="mt-3 text-xs text-muted-foreground"><strong className="font-medium">{testimonial.name}</strong> · {testimonial.meta}</div>
                </motion.div>
              </AnimatePresence>
            </div>

            <details className="rounded-md border border-border bg-card/20 p-3">
              <summary className="cursor-pointer">How does the AI feedback work?</summary>
              <div className="mt-2 text-sm text-muted-foreground">We analyze your transcript and delivery (pauses, filler words, clarity), then give targeted suggestions and example rewrites.</div>
            </details>
          </div>
        </div>
      </motion.div>
    </div>
  );
}