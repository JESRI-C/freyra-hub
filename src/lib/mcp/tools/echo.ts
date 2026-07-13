import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "echo",
  title: "Echo",
  description: "Echo the input text back to the caller. Use to verify connectivity.",
  inputSchema: { text: z.string().min(1).describe("Text to echo back.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ text }, ctx) => ({
    content: [
      {
        type: "text",
        text: ctx.isAuthenticated()
          ? `${text} (signed in as ${ctx.getUserEmail() ?? ctx.getUserId()})`
          : text,
      },
    ],
  }),
});
