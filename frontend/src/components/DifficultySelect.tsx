"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";

export type Difficulty = "" | "easy" | "medium" | "hard";

const label = (v: Difficulty | "all") =>
  v === "" || v === "all" ? "All difficulties" : v[0]!.toUpperCase() + v.slice(1);

export default function DifficultySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: Difficulty;
  onChange: (v: Difficulty) => void;
  disabled?: boolean;
}) {
  // Radix cannot use "" as an item value. Use "all" internally.
  const internal = value === "" ? "all" : value;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="difficulty" className="text-sm text-black/60 dark:text-white/70">
        Difficulty
      </label>

      <Select.Root
        value={internal}
        onValueChange={(v) => onChange(v === "all" ? "" : (v as Difficulty))}
        disabled={disabled}
      >
        <Select.Trigger
          id="difficulty"
          aria-label="Difficulty"
          className={clsx(
            "group inline-flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-sm outline-none",
            "border border-black/10 bg-black/[0.03] text-slate-900",
            "dark:border-white/10 dark:bg-white/5 dark:text-white",
            "focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-transparent",
            "data-[state=open]:border-brand-400/60",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {/* Show a colored pill when a concrete difficulty is chosen */}
          <div className="flex min-w-0 items-center gap-2">
            <ValuePill value={internal} />
            <span className="truncate text-black/80 dark:text-white/90">
              {label(internal)}
            </span>
          </div>
          <Select.Icon>
            <ChevronDown
              size={16}
              className="text-brand-500/80 dark:text-brand-300/80 transition-transform group-data-[state=open]:rotate-180"
            />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            // keep list aligned with trigger width
            className={clsx(
              "z-50 overflow-hidden rounded-2xl shadow-xl outline-none",
              "border border-black/10 bg-white text-slate-900",
              "dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white",
              "w-[--radix-select-trigger-width]",
              // subtle open/close animation
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            )}
            position="popper"
            sideOffset={8}
            collisionPadding={10}
          >
            <Select.ScrollUpButton className="flex items-center justify-center py-1 text-black/60 dark:text-white/70">
              <ChevronUp size={16} />
            </Select.ScrollUpButton>

            <Select.Viewport className="p-1">
              {/* sentinel non-empty value */}
              <Item value="all">All difficulties</Item>
              <Select.Separator className="my-1 h-px bg-black/10 dark:bg-white/10" />
              <Item value="easy"   className="text-emerald-300">Easy</Item>
              <Item value="medium" className="text-amber-300">Medium</Item>
              <Item value="hard"   className="text-rose-300">Hard</Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

/* ---------- helpers ---------- */

function ValuePill({ value }: { value: Difficulty | "all" }) {
  if (value === "all") return null;
  const color =
    value === "easy"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20"
      : value === "medium"
      ? "bg-amber-500/15 text-amber-300 ring-amber-400/20"
      : "bg-rose-500/15 text-rose-300 ring-rose-400/20";
  return (
    <span className={clsx("hidden sm:inline-flex items-center rounded-lg px-2 py-0.5 text-xs ring-1", color)}>
      {value}
    </span>
  );
}

function Item({
  value,
  children,
  className = "",
}: {
  value: "all" | "easy" | "medium" | "hard"; // never empty
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Select.Item
      value={value}
      className={clsx(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none",
        "text-slate-900 dark:text-white/90",
        "focus:bg-black/5 dark:focus:bg-white/10",
        "data-[state=checked]:bg-black/5 dark:data-[state=checked]:bg-white/10",
        className
      )}
    >
      <Select.ItemIndicator className="absolute right-2">
        <Check size={14} className="text-brand-500 dark:text-brand-300" />
      </Select.ItemIndicator>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}
