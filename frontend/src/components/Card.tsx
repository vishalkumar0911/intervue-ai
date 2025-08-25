import { ReactNode } from "react";

/** Simple rounded card */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 text-slate-900 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
      {children}
    </div>
  );
}

export default Card;
