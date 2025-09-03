// src/components/Card.tsx
import { HTMLAttributes, forwardRef } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Card
 * - Uses design tokens (bg-card, text-card-foreground, border) for perfect light/dark theming
 * - Optional: elevated (shadow), hoverable (lift on hover), padding size
 *
 * TIP: When composing with CardHeader/CardContent/CardFooter, set padding="none"
 * on <Card> to avoid double padding.
 */

type Padding = "none" | "sm" | "md" | "lg";
type Variant = "solid" | "surface";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  elevated?: boolean;
  hoverable?: boolean;
  variant?: Variant;
}

const pad: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      padding = "md",
      elevated = false,
      hoverable = false,
      variant = "solid",
      ...props
    },
    ref
  ) => {
    const base =
      "rounded-2xl border border-border bg-card text-card-foreground";
    const v =
      variant === "surface"
        ? "bg-card/70 backdrop-blur-sm"
        : "bg-card";
    const shadow = elevated ? "shadow-soft" : "shadow-sm";
    const hover = hoverable ? "transition-shadow hover:shadow-elevated" : "";

    return (
      <div
        ref={ref}
        className={twMerge(clsx(base, v, shadow, pad[padding], hover, className))}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

/* ---------- Optional subcomponents (useful for structured cards) ---------- */
/* When using these, set <Card padding="none"> to avoid double padding. */

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        clsx(
          "px-5 py-4 border-b border-border/60",
          "first:rounded-t-2xl"
        ),
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={twMerge(
        clsx("text-base font-semibold tracking-tight"),
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={twMerge(
        clsx("text-sm text-muted-foreground"),
        className
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(clsx("px-5 py-4"), className)}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        clsx("px-5 py-4 border-t border-border/60 last:rounded-b-2xl"),
        className
      )}
      {...props}
    />
  );
}

export default Card;
