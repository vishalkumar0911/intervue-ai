import { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

type Variant =
  | "brand"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";
type Size = "sm" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Optional small icon at the start (e.g., <Check className="h-3 w-3" />) */
  leadingIcon?: ReactNode;
  /** Fully rounded pill shape */
  pill?: boolean;
}

const base =
  "inline-flex select-none items-center gap-1.5 font-medium ring-1";
const sizes: Record<Size, string> = {
  sm: "rounded-lg px-2 py-0.5 text-[11px]",
  md: "rounded-xl px-2.5 py-1 text-xs",
};

const variants: Record<Variant, string> = {
  // Uses your tokens so it remains perfectly themed in light/dark
  brand: "bg-primary/15 text-primary ring-primary/30",
  neutral: "bg-muted text-muted-foreground ring-border/60",
  success:
    "bg-emerald-500/15 text-emerald-700 ring-emerald-400/30 dark:text-emerald-200",
  warning:
    "bg-amber-500/15 text-amber-700 ring-amber-400/30 dark:text-amber-200",
  danger: "bg-rose-500/15 text-rose-700 ring-rose-400/30 dark:text-rose-200",
  info: "bg-cyan-500/15 text-cyan-700 ring-cyan-400/30 dark:text-cyan-200",
  outline: "bg-transparent text-foreground ring-border/60",
};

export function Badge({
  children,
  variant = "brand",
  size = "md",
  leadingIcon,
  pill = false,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={twMerge(
        clsx(
          base,
          sizes[size],
          variants[variant],
          pill && "rounded-full",
          className
        )
      )}
      {...props}
    >
      {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export default Badge;
