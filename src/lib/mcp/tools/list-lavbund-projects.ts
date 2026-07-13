import { defineTool } from "@lovable.dev/mcp-js";

import { getProjects } from "@/services/lavbundService";
import { beregnKrediteretCO2, tiltagValidering } from "@/services/lavbundBeregning";

export default defineTool({
  name: "list_lavbund_projects",
  title: "List lavbunds­projekter",
  description:
    "List all LavbundsMRV projects with municipality, status, area (ha) and officially credited CO₂e (t/år, v12).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const projects = await getProjects();
    const rows = projects.map((p) => {
      const co2 = beregnKrediteretCO2(p);
      const tilt = tiltagValidering(p);
      return {
        id: p.id,
        navn: p.navn,
        kommune: p.kommune,
        status: p.status,
        arealHa: p.samletArealHa,
        krediteretTonCO2ePrAar: Number(co2.krediteretTotal.toFixed(2)),
        arealTjek: co2.arealTjek,
        aktiveTiltag: tilt.ok,
        aabneAfvigelser: p.afvigelser.filter((a) => a.aaben).length,
      };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { projects: rows },
    };
  },
});
