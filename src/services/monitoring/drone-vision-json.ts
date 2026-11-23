/** Repair transport formatting only. Never fill fields, coerce values, drop keys,
 * complete a truncated response or change prose. The visual schema still decides
 * whether the result is safe to retain. No model output is ever evaluated. */
export function parseDroneVisionJson(text: string): { value: unknown; repaired: boolean } {
  if (text.length > 16_000) throw new Error("Billedsvaret er for stort.");
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch {
    let candidate = text.replace(/^\uFEFF/, "").trim();
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(candidate);
    if (fenced) candidate = fenced[1].trim();
    // Remove trailing commas outside strings; a regex would corrupt quoted prose.
    let result = "",
      inString = false,
      escaped = false;
    for (let index = 0; index < candidate.length; index++) {
      const char = candidate[index];
      if (inString) {
        result += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else {
        if (char === '"') inString = true;
        if (char === "," && /^\s*[}\]]/.test(candidate.slice(index + 1))) continue;
        result += char;
      }
    }
    return { value: JSON.parse(result), repaired: true };
  }
}
