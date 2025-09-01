"use client";

import { useId } from "react";

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export default function ShuffleToggle({
  checked,
  onChange,
  disabled = false,
  className,
}: Props) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={[
        "inline-flex items-center gap-3 select-none text-sm",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        "text-muted-foreground",
        className || "",
      ].join(" ")}
    >
      <span className="relative inline-flex items-center">
        {/* Native checkbox for a11y; visually hidden but focusable */}
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {/* Track */}
        <span
          aria-hidden
          className={[
            "h-5 w-9 rounded-full border transition-colors",
            "border-border",
            // light: subtle track; dark: subtle as well
            "bg-muted/50 dark:bg-white/10",
            // checked state
            "peer-checked:bg-primary peer-checked:border-primary",
            // focus ring
            "ring-offset-background peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2",
          ].join(" ")}
        />
        {/* Thumb */}
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full shadow",
            "bg-white dark:bg-slate-200",
            "transform transition-transform",
            "peer-checked:translate-x-4",
          ].join(" ")}
        />
      </span>

      <span>Shuffle questions</span>
    </label>
  );
}
