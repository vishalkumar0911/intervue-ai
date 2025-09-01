"use client";

import * as Select from "@radix-ui/react-select";
import { useId } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";

export type Difficulty = "" | "easy" | "medium" | "hard";

const toLabel = (v: Difficulty | "all") =>
  v === "" || v === "all" ? "All difficulties" : v[0]!.toUpperCase() + v.slice(1);

type Props = {
  value: Difficulty;
  onChange: (v: Difficulty) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  hint?: string;
};

export default function DifficultySelect({
  value,
  onChange,
  disabled = false,
  className,
  label = "Difficulty",
  hint,
}: Props) {
  // Radix can't use empty string for value; map "" <-> "all"
  const internal = value === "" ? "all" : value;
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <label id={labelId} htmlFor={`${id}-trigger`} className="text-sm text-muted-foreground">
        {label}
      </label>

      <Select.Root
        value={internal}
        onValueChange={(v) => onChange(v === "all" ? "" : (v as Difficulty))}
        disabled={disabled}
      >
        <Select.Trigger
          id={`${id}-trigger`}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className={clsx(
            "group inline-flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-sm",
            "border bg-card/70 text-foreground backdrop-blur-sm",
            "border-border focus-ring",
            "data-[state=open]:border-ring/60",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ValuePill value={internal} />
            <span className="truncate">{toLabel(internal)}</span>
          </div>
          <Select.Icon asChild>
            <ChevronDown
              size={16}
              className="opacity-80 transition-transform group-data-[state=open]:rotate-180"
            />
          </Select.Icon>
        </Select.Trigger>

        {hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}

        <Select.Portal>
          <Select.Content
            side="bottom"
            sideOffset={8}
            position="popper"
            collisionPadding={10}
            className={clsx(
              "z-50 w-[--radix-select-trigger-width] overflow-hidden rounded-2xl shadow-xl outline-none",
              "border bg-card text-foreground border-border",
              // subtle open/close animation
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            )}
          >
            <Select.ScrollUpButton className="flex items-center justify-center py-1 text-muted-foreground">
              <ChevronUp size={16} />
            </Select.ScrollUpButton>

            <Select.Viewport className="p-1">
              <Item value="all">All difficulties</Item>
              <Select.Separator className="my-1 h-px bg-border" />
              <Item value="easy" className="text-emerald-300">Easy</Item>
              <Item value="medium" className="text-amber-300">Medium</Item>
              <Item value="hard" className="text-rose-300">Hard</Item>
            </Select.Viewport>

            <Select.ScrollDownButton className="flex items-center justify-center py-1 text-muted-foreground">
              <ChevronDown size={16} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

/* ---------- helpers ---------- */

function ValuePill({ value }: { value: Difficulty | "all" }) {
  if (value === "all") return null;
  const tone =
    value === "easy"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20"
      : value === "medium"
      ? "bg-amber-500/15 text-amber-300 ring-amber-400/20"
      : "bg-rose-500/15 text-rose-300 ring-rose-400/20";
  return (
    <span className={clsx("hidden sm:inline-flex items-center rounded-lg px-2 py-0.5 text-xs ring-1", tone)}>
      {value}
    </span>
  );
}

function Item({
  value,
  children,
  className,
}: {
  value: "all" | "easy" | "medium" | "hard";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select.Item
      value={value}
      className={clsx(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none",
        "text-foreground hover:bg-muted/40 focus:bg-muted/40",
        "data-[state=checked]:bg-muted/50",
        className
      )}
    >
      <Select.ItemIndicator className="absolute right-2">
        <Check size={14} className="text-ring" />
      </Select.ItemIndicator>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}
