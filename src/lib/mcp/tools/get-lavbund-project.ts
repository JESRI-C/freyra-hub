import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  getAnbefalinger,
  getGroefter,
  getProject,
  getReadings,
  getTransekter,
} from "@/services/lavbundService";
import { bygSnapshot } from "@/services/lavbundBeregning";

export default defineTool({
  name: "get_lavbund_project",
  title: "Hent lavbundsprojekt",
  description:
    "Return the LavbundsMRV project details plus a fresh calculation snapshot (CO₂ v12, verification degree, phosphorus balance) and DecisionsIQ recommendations.",
  inputSchema: {
    projectId: z.string().min(1).describe("Project id, e.g. 'lav-001'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const p = await getProject(projectId);
    if (!p)
      return {
        content: [{ type: "text", text: `Ukendt projekt: ${projectId}` }],
        isError: true,
      };
    const [readings, transekter, groefter, anbefalinger] = await Promise.all([
      getReadings(projectId),
      getTransekter(projectId),
      getGroefter(projectId),
      getAnbefalinger(projectId),
    ]);
    const snapshot = bygSnapshot({
      projekt: p,
      readings,
      transekterFoer: transekter.filter((t) => t.fase === "foer"),
      transekterEfter: transekter.filter((t) => t.fase === "efter"),
      groefter,
    });
    const payload = { projekt: p, snapshot, anbefalinger };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
