const SUPABASE_CREDENTIAL_ENV_NAMES = [
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
] as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function jsonError(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function readCredential(request: Request): string | null {
  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey) return apiKey;

  const authorization = request.headers.get("authorization")?.trim();
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

function decodeJwtPayload(value: string): Record<string, unknown> | null {
  const payload = value.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function isSupabaseCredential(value: string, env: ServerEnvironment): Promise<boolean> {
  if (value.startsWith("sb_publishable_") || value.startsWith("sb_secret_")) return true;

  for (const envName of SUPABASE_CREDENTIAL_ENV_NAMES) {
    const supabaseKey = env[envName]?.trim();
    if (supabaseKey && (await timingSafeEqual(value, supabaseKey))) return true;
  }

  const role = decodeJwtPayload(value)?.role;
  return role === "anon" || role === "service_role";
}

async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

/**
 * Authenticates a server endpoint with one dedicated, non-Supabase secret.
 * Returns a response on failure and null when the request is authorized.
 */
export async function requireDedicatedServerSecret(
  request: Request,
  secretEnvName: string,
  env: ServerEnvironment = process.env,
): Promise<Response | null> {
  const expectedSecret = env[secretEnvName]?.trim();

  // A missing secret or any Supabase API key in the secret slot is a server
  // misconfiguration. These endpoints require independent, rotatable secrets.
  if (!expectedSecret || (await isSupabaseCredential(expectedSecret, env))) {
    return jsonError("Server secret not configured", 503);
  }

  const providedSecret = readCredential(request);
  if (!providedSecret || (await isSupabaseCredential(providedSecret, env))) {
    return jsonError("Unauthorized", 401);
  }

  if (!(await timingSafeEqual(providedSecret, expectedSecret))) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
