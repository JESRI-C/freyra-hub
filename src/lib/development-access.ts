export function canViewDevelopment(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}
