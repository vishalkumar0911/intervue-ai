import clsx from "clsx";

export function Badge({
  children,
  variant = "brand",
}: {
  children: React.ReactNode;
  variant?: "brand" | "neutral";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-xl px-2.5 py-1 text-xs",
        variant === "brand"
          ? "bg-brand-600/15 text-brand-200 ring-1 ring-brand-400/20"
          : "bg-white/10 text-white/70 ring-1 ring-white/10"
      )}
    >
      {children}
    </span>
  );
}
