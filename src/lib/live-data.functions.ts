// Server function wrappers for live-data connectors.
// Running the HTTP calls server-side avoids browser CORS issues with
// DMI / Miljøportal / Datafordeler / Copernicus and keeps API tokens off
// the client bundle (read from process.env on the server).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ProjectGeometry } from "@/lib/supabase/types";
import {
  dmiClient,
  miljoeportalClient,
  dataforsyningenClient,
  copernicusClient,
} from "@/services/live-data";
import type { ConnectorResponse } from "@/services/live-data/live-data-client";
import type { DmiWeatherData } from "@/services/live-data/connectors/dmi-client";
import type { MiljoeportalData } from "@/services/live-data/connectors/miljoeportal-client";
import type { DataforsyningenData } from "@/services/live-data/connectors/dataforsyningen-client";
import type { CopernicusData } from "@/services/live-data/connectors/copernicus-client";

const GeometrySchema = z.object({
  geometry: z.object({
    polygon: z.unknown().nullable(),
    centroid: z
      .object({ lat: z.number(), lng: z.number() })
      .nullable(),
    areaHa: z.number().nullable(),
    hasValidGeometry: z.boolean(),
    geometrySource: z.string(),
    bufferZones: z.object({
      buffer100m: z.boolean(),
      buffer500m: z.boolean(),
      buffer1000m: z.boolean(),
    }),
  }),
});

export interface ProjectLiveDataBundle {
  weather: ConnectorResponse<DmiWeatherData>;
  nature: ConnectorResponse<MiljoeportalData>;
  places: ConnectorResponse<DataforsyningenData>;
  satellite: ConnectorResponse<CopernicusData>;
}

export const fetchProjectLiveData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GeometrySchema.parse(input))
  .handler(async ({ data }): Promise<ProjectLiveDataBundle> => {
    const geometry = data.geometry as ProjectGeometry;

    const [weather, nature, places, satellite] = await Promise.all([
      dmiClient.fetchByGeometry(geometry).catch(() => dmiClient.fetchPreview()),
      miljoeportalClient.fetchByGeometry(geometry).catch(() => miljoeportalClient.fetchPreview()),
      dataforsyningenClient.fetchByGeometry(geometry).catch(() => dataforsyningenClient.fetchPreview()),
      copernicusClient.fetchByGeometry(geometry).catch(() => copernicusClient.fetchPreview()),
    ]);

    return { weather, nature, places, satellite };
  });
