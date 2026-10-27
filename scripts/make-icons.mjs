/**
 * Writes public/icon-192.png and public/icon-512.png without any image dependency:
 * a raw PNG encoder over node:zlib, drawing the same funnel glyph as public/icon.svg.
 * Run: node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function crc32(buf) {
  let c;
  const table = crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    let x = n;
    for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
    return x >>> 0;
  });
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inFunnel(x, y, s) {
  const u = (x / s) * 512;
  const v = (y / s) * 512;
  if (u >= 96 && u <= 416 && v >= 152 && v <= 172) return true;
  const t = (v - 152) / 240;
  if (v >= 152 && v <= 332 && t >= 0 && t <= 1) {
    const half = 160 * (1 - t) + 44;
    if (Math.abs(u - 256) <= half) return true;
  }
  if (v > 332 && v <= 400 && Math.abs(u - 256) <= 56) return true;
  return false;
}

function inRing(x, y, s) {
  const u = (x / s) * 512;
  const v = (y / s) * 512;
  const d = Math.hypot(u - 356, v - 392);
  return d <= 59 && d >= 33;
}

function inHandle(x, y, s) {
  const u = (x / s) * 512;
  const v = (y / s) * 512;
  if (v < u - 20 || v > u + 34) return false;
  return u >= 386 && u <= 452 && v >= 420 && v <= 486;
}

function roundedMask(x, y, s) {
  const r = s * 0.1875;
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return Math.hypot(x - cx, y - cy) <= r + 0.5;
}

const BG = [14, 17, 22];
const GREEN = [126, 231, 135];
const BLUE = [108, 182, 255];

function draw(x, y, s) {
  if (!roundedMask(x, y, s)) return [0, 0, 0];
  if (inRing(x, y, s) || inHandle(x, y, s)) return BLUE;
  if (inFunnel(x, y, s)) return GREEN;
  return BG;
}

for (const size of [192, 512]) {
  const buf = png(size, draw);
  writeFileSync(join(root, `icon-${size}.png`), buf);
  console.log(`wrote public/icon-${size}.png (${buf.length} bytes)`);
}
