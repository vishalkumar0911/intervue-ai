// src/app/(app)/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminIndex() {
  // server component redirect
  redirect("/admin/users");
}
