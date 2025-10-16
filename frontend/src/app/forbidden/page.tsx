"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10">
        <ShieldAlert className="h-6 w-6 text-rose-500" />
      </div>
      <h1 className="text-3xl font-semibold text-foreground">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You don’t have permission to view this page.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <Link href="/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
        <Button variant="ghost" onClick={() => history.back()}>
          Go back
        </Button>
      </div>
    </main>
  );
}
