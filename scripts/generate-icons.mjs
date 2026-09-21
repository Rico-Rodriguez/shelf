import { createWriteStream } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function writePng(path, size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  createWriteStream(path).end(png);
}

function shelfPixel(x, y, size) {
  const px = Math.floor((x / size) * 16);
  const py = Math.floor((y / size) * 16);
  const cream = [244, 232, 209];
  const ink = [61, 44, 41];
  const wood = [196, 164, 132];
  const mustard = [224, 168, 74];
  const moss = [107, 143, 94];
  const rose = [212, 132, 124];
  const denim = [74, 111, 165];
  const paper = [255, 248, 238];
  if (py === 2 || py === 3 || py === 7 || py === 8 || py === 12 || py === 13) return ink;
  if (py >= 4 && py <= 6) {
    if (px >= 2 && px <= 4) return mustard;
    if (px >= 6 && px <= 8) return moss;
    if (px >= 10 && px <= 12) return rose;
    return wood;
  }
  if (py >= 9 && py <= 11) {
    if (px >= 3 && px <= 6) return denim;
    if (px >= 9 && px <= 12) return paper;
    return wood;
  }
  return cream;
}

writePng(join(root, "icon-192.png"), 192, shelfPixel);
writePng(join(root, "icon-512.png"), 512, shelfPixel);
writePng(join(root, "apple-touch-icon.png"), 180, shelfPixel);
console.log("wrote PWA icons");
