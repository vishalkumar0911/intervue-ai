"use client";

export default function ShuffleToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-6 inline-flex cursor-pointer select-none items-center gap-3 text-white">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-white/20 bg-transparent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-white/80">Shuffle questions</span>
    </label>
  );
}
