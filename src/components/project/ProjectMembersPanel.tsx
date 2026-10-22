import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/ui-bits";
import {
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_TONE,
  type ProjectRole,
  type ProjectPermissions,
} from "@/services/project-members-service";

interface Props {
  projectId: string;
  currentUserId?: string;
  permissions: ProjectPermissions;
}

const ALL_ROLES: ProjectRole[] = ["admin", "project_manager", "editor", "field", "viewer", "external"];

export function ProjectMembersPanel({ projectId, currentUserId, permissions }: Props) {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("editor");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => listProjectMembers(projectId),
    enabled: !!projectId,
  });

  const add = useMutation({
    mutationFn: () =>
      addProjectMember({ project_id: projectId, user_id: inviteUserId.trim(), role: inviteRole }),
    onSuccess: () => {
      toast.success("Medlem tilføjet");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["audit", projectId] });
      setShowInvite(false);
      setInviteUserId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: ProjectRole }) =>
      updateProjectMemberRole(id, projectId, role),
    onSuccess: () => {
      toast.success("Rolle opdateret");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["audit", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeProjectMember(id, projectId),
    onSuccess: () => {
      toast.success("Medlem fjernet");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["audit", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm text-muted-foreground">
            {members.length} medlem{members.length === 1 ? "" : "mer"} · din rolle:{" "}
            {permissions.role ? (
              <Pill tone={ROLE_TONE[permissions.role]}>{ROLE_LABELS[permissions.role]}</Pill>
            ) : (
              <span className="italic">ikke medlem</span>
            )}
          </div>
        </div>
        {permissions.canManage && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" /> Tilføj medlem
          </button>
        )}
      </div>

      {showInvite && permissions.canManage && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
          <div className="grid sm:grid-cols-[1fr_200px_auto] gap-2 items-end">
            <label className="text-xs">
              <span className="block text-muted-foreground mb-0.5">Bruger-ID (UUID)</span>
              <input
                value={inviteUserId}
                onChange={(e) => setInviteUserId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full px-2 py-1.5 text-sm rounded-lg border bg-background font-mono"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-0.5">Rolle</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border bg-background"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => add.mutate()}
              disabled={!inviteUserId.trim() || add.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Tilføj
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[inviteRole]}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Indlæser medlemmer…</p>
      ) : members.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Shield className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium">Ingen medlemmer endnu</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tilføj det første medlem for at åbne projektet for samarbejde.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {members.map((m) => {
            const isSelf = m.user_id === currentUserId;
            return (
              <div key={m.id} className="py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                  {(m.display_name || m.email || m.user_id).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.display_name || m.email || m.user_id.slice(0, 8) + "…"}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(dig)</span>}
                  </div>
                  {m.email && m.display_name && (
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  )}
                </div>
                {permissions.canManage && !isSelf ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as ProjectRole })}
                    className="px-2 py-1 text-xs rounded border bg-background"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Pill tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Pill>
                )}
                {permissions.canAdmin && !isSelf && (
                  <button
                    onClick={() => {
                      if (confirm(`Fjern medlem?`)) remove.mutate(m.id);
                    }}
                    className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
                    title="Fjern"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
