export type Role = "Student" | "Trainer" | "Admin";

export const ROLES: Role[] = ["Student", "Trainer", "Admin"];

/** True if the current user's role is among allowed ones. Empty allowed ⇒ open to all. */
export function hasAnyRole(
  user?: { role?: string | null } | null,
  allowed?: Role[] | undefined
) {
  if (!allowed || allowed.length === 0) return true;
  const r = (user?.role || "").trim();
  return (allowed as string[]).includes(r);
}

/** Utility: whether we should push a user to onboarding (missing role). */
export function needsRoleOnboarding(user?: { role?: string | null }) {
  return !user?.role;
}
