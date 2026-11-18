import type { EnvironmentalContextResult, ProjectEnvironmentalContext } from "@/lib/supabase/types";
import type { ConnectorStatusItem } from "@/components/maps/ConnectorStatusPanel";

/** Status describes this project's retrieved evidence, never merely a configured provider. */
export function projectMapConnectorStatus(input: {
  projectId: string;
  context?: ProjectEnvironmentalContext;
  fetching: boolean;
  failed: boolean;
}): ConnectorStatusItem[] {
  const context = input.context?.projectId === input.projectId ? input.context : undefined;
  function resultStatus(
    result: EnvironmentalContextResult | null | undefined,
  ): Pick<ConnectorStatusItem, "status" | "note" | "lastChecked"> {
    if (input.failed)
      return { status: "unavailable", note: "Projektets kildeoplysninger kunne ikke hentes." };
    if (input.fetching)
      return { status: "checking", note: "Henter kildeoplysninger for projektet…" };
    if (!result || result.projectId !== input.projectId)
      return { status: "unverified", note: "Ingen verificerede data for dette projekt." };
    if (result.status === "error") return { status: "unavailable", note: result.summary };
    if (result.status === "fallback") return { status: "preview", note: result.summary };
    if (
      result.status !== "success" ||
      !Number.isFinite(Date.parse(result.fetchedAt)) ||
      Object.keys(result.data).length === 0
    ) {
      return { status: "unverified", note: result.summary };
    }
    return { status: "retrieved", note: result.summary, lastChecked: result.fetchedAt };
  }
  return [
    {
      name: "Copernicus Sentinel-2",
      slug: "sentinel",
      provider: "ESA / Copernicus",
      ...resultStatus(context?.satelliteContext),
    },
    {
      name: "Danmarks Miljøportal",
      slug: "miljodata",
      provider: "Miljøministeriet",
      ...resultStatus(context?.natureContext),
    },
    {
      name: "Dataforsyningen",
      slug: "dataforsyningen",
      provider: "Dataforsyningen",
      status: "unverified",
      note: "Stedopslag er ikke hentet på denne projektside.",
    },
    {
      name: "DMI Vejrdata",
      slug: "dmi",
      provider: "DMI Open Data",
      ...resultStatus(context?.rainfallContext),
    },
  ];
}
