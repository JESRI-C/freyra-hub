/** Applies to dynamic application responses; public assets are served separately. */
export function protectApplicationResponse(response: Response): Response {
  // A Workers WebSocket upgrade carries platform state that must not be reconstructed.
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Keep the original stream: do not buffer exports or MCP event streams.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
