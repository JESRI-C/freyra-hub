const MAX_DERIVATIVE_BYTES = 2 * 1024 * 1024;
export function sanitizePreviewJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 4 ||
    bytes.length > MAX_DERIVATIVE_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  )
    throw new Error("Ugyldigt visningsbillede.");
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2,
    widthPx = 0,
    heightPx = 0,
    scans = 0,
    markers = 0,
    entropy = false;
  // Progressive JPEGs can have metadata between scans. Walk through EOI while
  // preserving stuffed bytes and restart markers inside the image scan data.
  while (offset < bytes.length) {
    if (entropy) {
      const start = offset;
      let ended = false;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) continue;
        const markerStart = offset - 1;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        parts.push(bytes.subarray(start, markerStart));
        offset = markerStart;
        entropy = false;
        ended = true;
        break;
      }
      if (!ended) throw new Error("Ugyldigt visningsbillede.");
      continue;
    }
    if (++markers > 4096) throw new Error("Ugyldigt visningsbillede.");
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error("Ugyldigt visningsbillede.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (!marker || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7))
      throw new Error("Ugyldigt visningsbillede.");
    if (marker === 0xd9) {
      if (!scans || !widthPx || !heightPx || offset !== bytes.length)
        throw new Error("Ugyldigt visningsbillede.");
      parts.push(bytes.subarray(start, offset));
      const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
      let position = 0;
      for (const part of parts) {
        result.set(part, position);
        position += part.length;
      }
      return { bytes: result, widthPx, heightPx };
    }
    if (offset + 1 >= bytes.length) throw new Error("Ugyldigt visningsbillede.");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("Ugyldigt visningsbillede.");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || widthPx || heightPx) throw new Error("Ugyldigt visningsbillede.");
      heightPx = (bytes[offset + 3] << 8) | bytes[offset + 4];
      widthPx = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!widthPx || !heightPx || Math.max(widthPx, heightPx) > 1536)
        throw new Error("Ugyldigt visningsbillede.");
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      throw new Error("Ugyldigt visningsbillede.");
    }
    if (marker === 0xda) {
      if (!widthPx || !heightPx || ++scans > 256) throw new Error("Ugyldigt visningsbillede.");
      entropy = true;
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      parts.push(bytes.subarray(start, offset + length));
    offset += length;
  }
  throw new Error("Ugyldigt visningsbillede.");
}
