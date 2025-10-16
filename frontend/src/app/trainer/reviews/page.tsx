// app/trainer/reviews/page.tsx
import RequireRole from "@/components/auth/RequireRole";

export default function TrainerReviewsPage() {
  return (
    <RequireRole roles={["Trainer", "Admin"]} mode="inline">
      <h1 className="text-2xl font-semibold">Trainer Reviews</h1>
      {/* ... */}
    </RequireRole>
  );
}
