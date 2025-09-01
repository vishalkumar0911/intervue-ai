// src/components/RoleSelect.tsx
"use client";

import clsx from "clsx";

type Props = {
  roles: string[];
  value?: string;
  onChange: (role: string) => void;
  id?: string;
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export default function RoleSelect({
  roles,
  value,
  onChange,
  id = "role",
  label = "Select a role",
  loading = false,
  disabled = false,
  placeholder = "Choose a role…",
}: Props) {
  const isEmpty = roles.length === 0;
  const isDisabled = disabled || loading || isEmpty;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm text-muted-foreground"
      >
        {label}
      </label>

      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          className={clsx(
            // layout
            "block w-full appearance-none rounded-xl px-4 py-3 text-sm",
            // theme tokens
            "bg-background text-foreground border border-input",
            // placeholder color (when value === "")
            "placeholder:text-muted-foreground",
            // focus ring consistent with app
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 ring-offset-background",
            // subtle shadow to match cards
            "shadow-sm",
            // disabled styles
            isDisabled && "opacity-60 cursor-not-allowed"
          )}
        >
          <option value="" disabled>
            {loading ? "Loading roles…" : isEmpty ? "No roles available" : placeholder}
          </option>
          {roles.map((r) => (
            <option
              key={r}
              value={r}
              // Option backgrounds to avoid unreadable native defaults on some browsers
              className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            >
              {r}
            </option>
          ))}
        </select>

        {/* chevron */}
        <span
          className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-muted-foreground"
          aria-hidden="true"
        >
          ▾
        </span>
      </div>
    </div>
  );
}
