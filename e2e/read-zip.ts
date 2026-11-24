import { inflateRawSync } from "node:zlib";

/** Read central-directory entries independently of the app's ZIP writer. */
export function readZip(bytes: Buffer) {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw new Error("ZIP directory missing.");
  const count = bytes.readUInt16LE(end + 10);
  if (count > 512) throw new Error("Unexpected synthetic ZIP entry count.");
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP entry.");
    const method = bytes.readUInt16LE(offset + 10),
      size = bytes.readUInt32LE(offset + 20);
    const expectedSize = bytes.readUInt32LE(offset + 24),
      nameSize = bytes.readUInt16LE(offset + 28);
    if (expectedSize > 27 * 1024 * 1024) throw new Error("Unexpected synthetic ZIP size.");
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString("utf8");
    const local = bytes.readUInt32LE(offset + 42);
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error("Invalid ZIP local header.");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    const data =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: expectedSize })
          : null;
    if (!data || data.length !== expectedSize || files.has(name))
      throw new Error("Invalid ZIP file content.");
    files.set(name, data);
    offset += 46 + nameSize + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return files;
}
