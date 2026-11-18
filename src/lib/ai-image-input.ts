/** Caller-provided inline bytes only. This is not a project/object or pixel-verification claim. */
export const AI_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AI_IMAGE_MAX_DATA_URL_CHARACTERS = 32 + Math.ceil(AI_IMAGE_MAX_BYTES / 3) * 4;

export function isAllowedAiImageDataUrl(value: string): boolean {
  if (value.length > AI_IMAGE_MAX_DATA_URL_CHARACTERS) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const decoded = atob(match[2]);
    if (!decoded.length || decoded.length > AI_IMAGE_MAX_BYTES || btoa(decoded) !== match[2])
      return false;
    const signature = [...decoded.slice(0, 12)].map((character) => character.charCodeAt(0));
    if (match[1] === "jpeg")
      return signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (match[1] === "png")
      return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
    return decoded.startsWith("RIFF") && decoded.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}
