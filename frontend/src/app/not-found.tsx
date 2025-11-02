"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-3xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        The page you’re looking for doesn’t exist or was moved.
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl border border-border bg-secondary/60 px-4 py-2 text-sm hover:bg-secondary focus-ring"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
