import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listLavbundProjectsTool from "./tools/list-lavbund-projects";
import getLavbundProjectTool from "./tools/get-lavbund-project";

// The OAuth issuer must be the direct Supabase host (RFC 8414). On publish
// SUPABASE_URL is rewritten to the proxy — use the project ref, which Vite
// inlines at build time as a literal.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gofreyra-mcp",
  title: "GoFreyra MCP",
  version: "0.1.0",
  instructions:
    "Tools for GoFreyra — a nature-data, sensor and ESG platform. Use `list_lavbund_projects` to enumerate LavbundsMRV projects and `get_lavbund_project` for the full CO₂/phosphorus snapshot plus DecisionsIQ recommendations for one project. `echo` verifies connectivity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, listLavbundProjectsTool, getLavbundProjectTool],
});
