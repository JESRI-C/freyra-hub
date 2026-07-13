import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";

export const Route = createFileRoute("/app/lavbund")({
  head: () => ({
    meta: [
      { title: "LavbundsMRV — GoFreyra" },
      {
        name: "description",
        content:
          "Måling, rapportering og verifikation af lavbunds- og vandprojekters CO₂- og fosforeffekt.",
      },
    ],
  }),
  component: LavbundLayout,
});

function LavbundLayout() {
  return (
    <div className="min-w-0 overflow-x-hidden">
      <AppTopbar
        title="LavbundsMRV"
        subtitle="Målt verifikation af CO₂- og fosforeffekt for lavbunds- og vandprojekter"
      />
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
