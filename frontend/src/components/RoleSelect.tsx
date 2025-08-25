"use client";

type Props = {
  roles: string[];
  value?: string;
  onChange: (role: string) => void;
};

export default function RoleSelect({ roles, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="role" className="text-sm text-muted-foreground">
        Select a role
      </label>

      <div className="relative">
        <select
          id="role"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={[
            "w-full appearance-none rounded-2xl px-4 py-3 text-sm outline-none",
            "border border-black/10 bg-black/[0.03] text-slate-900",
            "focus-visible:ring-2 focus-visible:ring-brand-500/60",
            "dark:border-white/10 dark:bg-white/5 dark:text-white",
            "data-[state=open]:border-brand-400/60",
          ].join(" ")}
        >
          <option value="" disabled>
            Choose a role…
          </option>
          {roles.map((r) => (
            <option key={r} value={r} className="text-slate-900 dark:text-brand-200 dark:bg-[#0b0f1a]">
              {r}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 dark:text-brand-300/80">
          ▾
        </span>
      </div>
    </div>
  );
}
