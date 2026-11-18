import { describe, expect, it } from "vitest";
import { protectApplicationResponse } from "../application-response";

describe("dynamic application response protection", () => {
  it.each([200, 401, 403, 500])("prevents caching of app data and failures (%s)", (status) => {
    const response = protectApplicationResponse(
      new Response("private", { status, headers: { "Cache-Control": "public, max-age=600" } }),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("preserves login redirects and separate session cookies", () => {
    const headers = new Headers({ Location: "/app", "Content-Type": "text/html" });
    headers.append("Set-Cookie", "session=one; HttpOnly; Secure");
    headers.append("Set-Cookie", "refresh=two; HttpOnly; Secure");
    const response = protectApplicationResponse(new Response(null, { status: 303, headers }));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/app");
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(response.body).toBeNull();
  });

  it("preserves an unbuffered event stream, its content type and abort", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = protectApplicationResponse(
      new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
    );
    expect(response.body).toBe(stream);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: first\n\n");
    await reader.cancel();
    expect(cancelled).toBe(true);
  });

  it("accepts immutable upstream response headers without mutating them", async () => {
    const upstream = await fetch("data:application/json,%7B%22ok%22%3Atrue%7D");
    const response = protectApplicationResponse(upstream);
    expect(upstream.headers.has("Cache-Control")).toBe(false);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("preserves a Workers WebSocket upgrade object", () => {
    const upgrade = new Response(null);
    Object.defineProperties(upgrade, { status: { value: 101 }, webSocket: { value: {} } });
    expect(protectApplicationResponse(upgrade)).toBe(upgrade);
  });
});
