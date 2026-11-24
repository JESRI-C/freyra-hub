import { deflateSync } from "node:zlib";

// A small generated color pattern: no customer image or camera metadata.
export function syntheticPhoto(): Buffer {
  function chunk(type: string, data: Buffer) {
    const name = Buffer.from(type),
      length = Buffer.alloc(4),
      check = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([name, data])) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, name, data, check]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8);
  header.writeUInt32BE(4, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(4 * 33);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 8; x++) {
      const offset = y * 33 + 1 + x * 4;
      rows[offset] = x * 30;
      rows[offset + 1] = y * 60;
      rows[offset + 2] = 120;
      rows[offset + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
