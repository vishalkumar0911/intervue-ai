// src/components/ui/Textarea.tsx
"use client";

import * as React from "react";
import clsx from "clsx";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(
  ({ label, error, className, disabled, ...props }, ref) => {
    const ariaInvalid = Boolean(error) || props["aria-invalid"];

    return (
      <label className="block">
        {label && (
          <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
        )}

        <textarea
          ref={ref}
          disabled={disabled}
          aria-invalid={ariaInvalid || undefined}
          {...props}
          className={clsx(
            "w-full rounded-xl px-3 py-2 text-sm resize-y",
            "border border-input bg-transparent text-foreground placeholder:text-muted-foreground/70",
            "focus-ring disabled:cursor-not-allowed disabled:opacity-60",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
            className
          )}
        />

        {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
      </label>
    );
  }
);

Textarea.displayName = "Textarea";
