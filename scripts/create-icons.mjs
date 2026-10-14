import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const buildDir = path.join(root, 'build');
fs.mkdirSync(buildDir, { recursive: true });

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function png(size) {
  const rows = [];
  const radius = size * 0.18;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = 1 + x * 4;
      const dx = Math.max(radius - x, 0, x - (size - radius));
      const dy = Math.max(radius - y, 0, y - (size - radius));
      const outside = dx * dx + dy * dy > radius * radius;
      const inCheck =
        x > size * 0.28 &&
        x < size * 0.72 &&
        y > size * 0.28 &&
        y < size * 0.72 &&
        Math.abs(y - (x * 0.52 + size * 0.22)) < size * 0.045;
      row[index] = inCheck ? 255 : 36;
      row[index + 1] = inCheck ? 253 : 75;
      row[index + 2] = inCheck ? 248 : 58;
      row[index + 3] = outside ? 0 : 255;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const iconPng = png(1024);
fs.writeFileSync(path.join(buildDir, 'icon.png'), iconPng);
fs.writeFileSync(
  path.join(buildDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="184" fill="#244b3a"/><path d="M298 532l128 128 300-332" fill="none" stroke="#fffdf8" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`
);

const icoPng = png(256);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 0;
icoHeader[7] = 0;
icoHeader[8] = 0;
icoHeader[9] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(icoPng.length, 14);
icoHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), Buffer.concat([icoHeader, icoPng]));

if (os.platform() === 'darwin') {
  const iconset = path.join(buildDir, 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), png(size));
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), png(size * 2));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')], { stdio: 'inherit' });
} else if (!fs.existsSync(path.join(buildDir, 'icon.icns'))) {
  fs.writeFileSync(path.join(buildDir, 'icon.icns.todo'), 'Run npm run icons on macOS to generate build/icon.icns.\n');
}
