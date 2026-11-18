import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
export function OrganizationProfilePage() {
  const auth = useAuth();
  const query = useQuery({
    queryKey: ["organization-profile", auth.user?.id, auth.orgId],
    enabled: !!(auth.user && auth.orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,type,country")
        .eq("id", auth.orgId!)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  return (
    <main className="p-6 max-w-[1400px] mx-auto w-full space-y-4">
      <h1 className="text-2xl font-semibold">Organisationsprofil</h1>
      {query.isPending ? (
        <p>Indlæser organisation…</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        query.data && (
          <ProfileForm
            key={query.data.id}
            profile={query.data}
            canEdit={["owner", "admin"].includes(auth.currentOrg?.role ?? "")}
          />
        )
      )}
      <p>{auth.currentOrg?.projects.length ?? 0} tilgængelige projekter i organisationen.</p>
    </main>
  );
}
function ProfileForm({
  profile,
  canEdit,
}: {
  profile: { id: string; name: string; type: string | null; country: string | null };
  canEdit: boolean;
}) {
  const [name, setName] = useState(profile.name),
    [type, setType] = useState(profile.type ?? ""),
    [country, setCountry] = useState(profile.country ?? "");
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim(), type: type.trim() || null, country: country.trim() })
        .eq("id", profile.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => window.location.reload(),
  });
  return (
    <form
      className="space-y-3 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      {[
        ["Navn", name, setName],
        ["Organisationstype", type, setType],
        ["Land", country, setCountry],
      ].map(([label, value, setter]) => (
        <label className="block" key={label as string}>
          {label as string}
          <input
            className="block w-full border p-2"
            disabled={!canEdit}
            value={value as string}
            required={label !== "Organisationstype"}
            onChange={(e) => (setter as (v: string) => void)(e.target.value)}
          />
        </label>
      ))}
      {canEdit ? (
        <Button disabled={mutation.isPending}>Gem ændringer</Button>
      ) : (
        <p>Din adgang er læseadgang.</p>
      )}
      {mutation.error && <p role="alert">Kunne ikke gemme: {mutation.error.message}</p>}
    </form>
  );
}
