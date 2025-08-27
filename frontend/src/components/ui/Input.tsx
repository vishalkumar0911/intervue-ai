"use client";

import * as React from "react";
import clsx from "clsx";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, ...props }: Props) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm text-black/70 dark:text-white/70">
          {label}
        </span>
      )}
      <input
        {...props}
        className={clsx(
          "w-full rounded-xl border bg-white/60 px-3 py-2 text-sm text-slate-900 outline-none",
          "placeholder:text-slate-400",
          "focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20",
          "dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40",
          className
        )}
      />
      {error && <div className="mt-1 text-xs text-rose-400">{error}</div>}
    </label>
  );
}
