import { Building2, ClipboardList, FolderOpen, Sprout } from "lucide-react";

export const projectManagementEntry = {
  to: "/app/program",
  label: "Projektstyring",
  icon: FolderOpen,
} as const;

export const projectManagementLinks = [
  { to: "/app/projects", label: "Naturprojekter", icon: Sprout },
  { to: "/app/construction", label: "Byggeprojekter", icon: Building2 },
  { to: "/app/work-orders", label: "Sager og arbejdsordrer", icon: ClipboardList },
] as const;
