// Encode a TrueType font as WOFF 1.0 (https://www.w3.org/TR/WOFF/): every sfnt table is stored
// zlib-compressed, or raw when that is not smaller, so decoding returns the original table bytes.
// SoraFS gateways refuse whole files above 8 MiB; the 9.6 MB Noto Sans JP TTF fits as WOFF.
// The output is decoded again and refused unless every table and checksum matches the input.
// Usage: node scripts/encode-woff.mjs <input.ttf> <output.woff>
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/encode-woff.mjs <input.ttf> <output.woff>');
const pad4 = n => (n + 3) & ~3;

function sfntTables(font) {
  const flavor = font.readUInt32BE(0), count = font.readUInt16BE(4);
  if (flavor !== 0x00010000 && flavor !== 0x74727565) throw new Error('Input is not a TrueType sfnt.');
  const tables = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i, offset = font.readUInt32BE(at + 8), length = font.readUInt32BE(at + 12);
    if (offset + length > font.length) throw new Error('sfnt table extends past the end of the font.');
    tables.push({ tag: font.subarray(at, at + 4), checksum: font.readUInt32BE(at + 4), data: font.subarray(offset, offset + length) });
  }
  tables.sort((a, b) => Buffer.compare(a.tag, b.tag));
  return { flavor, tables };
}

function encode(font) {
  const { flavor, tables } = sfntTables(font);
  const head = tables.find(table => table.tag.toString('latin1') === 'head');
  if (!head) throw new Error('sfnt has no head table.');
  const stored = tables.map(table => { const packed = deflateSync(table.data, { level: 9 }); return packed.length < table.data.length ? packed : table.data; });
  const directory = 44 + 20 * tables.length;
  let size = directory;
  const offsets = stored.map(data => { const at = size; size += pad4(data.length); return at; });
  const woff = Buffer.alloc(size);
  woff.writeUInt32BE(0x774f4646, 0); woff.writeUInt32BE(flavor, 4); woff.writeUInt32BE(size, 8);
  woff.writeUInt16BE(tables.length, 12);
  woff.writeUInt32BE(12 + 16 * tables.length + tables.reduce((sum, table) => sum + pad4(table.data.length), 0), 16);
  woff.writeUInt16BE(head.data.readUInt16BE(4), 20); woff.writeUInt16BE(head.data.readUInt16BE(6), 22); // head.fontRevision
  tables.forEach((table, i) => {
    const at = 44 + 20 * i;
    table.tag.copy(woff, at); woff.writeUInt32BE(offsets[i], at + 4); woff.writeUInt32BE(stored[i].length, at + 8);
    woff.writeUInt32BE(table.data.length, at + 12); woff.writeUInt32BE(table.checksum, at + 16);
    stored[i].copy(woff, offsets[i]);
  });
  return { woff, tables };
}

function verify(woff, tables) {
  if (woff.readUInt32BE(0) !== 0x774f4646 || woff.readUInt32BE(8) !== woff.length || woff.readUInt16BE(12) !== tables.length) throw new Error('WOFF header does not describe the file.');
  tables.forEach((table, i) => {
    const at = 44 + 20 * i, offset = woff.readUInt32BE(at + 4), packed = woff.readUInt32BE(at + 8), length = woff.readUInt32BE(at + 12);
    const data = woff.subarray(offset, offset + packed), decoded = packed < length ? inflateSync(data) : data;
    if (!woff.subarray(at, at + 4).equals(table.tag) || offset % 4 || woff.readUInt32BE(at + 16) !== table.checksum || !decoded.equals(table.data)) {
      throw new Error(`WOFF table ${table.tag.toString('latin1')} does not decode to the original bytes.`);
    }
  });
}

const font = await readFile(input), { woff, tables } = encode(font);
verify(woff, tables);
await writeFile(output, woff);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({ input, inputBytes: font.length, inputSha256: sha256(font), output, outputBytes: woff.length, outputSha256: sha256(woff), tables: tables.length, losslessTables: true }, null, 2));
