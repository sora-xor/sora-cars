// Closed byte operations for the native V1 game-certificate boundary.
export class GameCertificateErrorV1 extends Error {
  constructor(code, message) { super(message); this.name = "GameCertificateErrorV1"; this.code = code; }
}
export function fail(code, message) { throw new GameCertificateErrorV1(code, message); }
export function bytes(value, max, label = "bytes") {
  if (!(value instanceof Uint8Array)) fail("Codec", `${label} must be a Uint8Array`);
  if (typeof SharedArrayBuffer !== "undefined" && value.buffer instanceof SharedArrayBuffer) {
    fail("Codec", `${label} must not use shared storage`);
  }
  if (value.byteLength > max) fail("Bound", `${label} exceeds its byte bound`);
  return value;
}
export function fixed(value, size, label) {
  bytes(value, size, label);
  if (value.byteLength !== size) fail("Codec", `${label} must contain ${size} bytes`);
  return Uint8Array.from(value);
}
export function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
export function parseLiteral(value, prefix, size) {
  if (typeof value !== "string" || value.length !== prefix.length + size * 2 || !value.startsWith(prefix)) {
    fail("Literal", `expected exact ${prefix} literal`);
  }
  const hex = value.slice(prefix.length);
  if (/[^0-9A-F]/u.test(hex)) fail("Literal", "literal requires uppercase ASCII hex");
  return Uint8Array.from({ length: size }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
export function formatLiteral(value, prefix, size) {
  const raw = fixed(value, size, prefix);
  return prefix + Array.from(raw, (v) => v.toString(16).toUpperCase().padStart(2, "0")).join("");
}
export const parseGameCommitmentLiteralV1 = (value) => parseLiteral(value, "game384:", 48);
export const formatGameCommitmentLiteralV1 = (value) => formatLiteral(value, "game384:", 48);
export const parseGameNonceLiteralV1 = (value) => parseLiteral(value, "nonce32:", 32);
export const formatGameNonceLiteralV1 = (value) => formatLiteral(value, "nonce32:", 32);
/** Exact JSON token; escaped characters and surrounding whitespace are not canonical. */
export function decodeGameCommitmentJsonV1(text) {
  if (typeof text !== "string" || text.length !== 106 || text[0] !== '"' || text[105] !== '"') {
    fail("Literal", "expected one exact commitment JSON token");
  }
  const literal = text.slice(1, -1);
  parseGameCommitmentLiteralV1(literal);
  return literal;
}
export function unsigned(value, bits) {
  if ((typeof value !== "bigint" && (typeof value !== "number" || !Number.isSafeInteger(value)))
      || value < 0 || BigInt(value) >= (1n << BigInt(bits))) fail("Codec", `expected u${bits}`);
  return BigInt(value);
}
export function little(value, size) {
  let n = unsigned(value, size * 8);
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) { out[i] = Number(n & 255n); n >>= 8n; }
  return out;
}
export function fromLittle(raw) {
  let n = 0n;
  for (let i = raw.length - 1; i >= 0; i -= 1) n = (n << 8n) | BigInt(raw[i]);
  return n;
}
export function concat(parts, cap = 8 * 1024 * 1024) {
  let length = 0;
  for (const part of parts) { length += part.length; if (length > cap) fail("Bound", "encoded body exceeds bound"); }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
export function leb(value) {
  let n = unsigned(value, 32);
  const out = [];
  do { let b = Number(n & 127n); n >>= 7n; if (n) b |= 128; out.push(b); } while (n);
  return Uint8Array.from(out);
}
export function field(raw) { return concat([leb(raw.length), raw]); }
export class Reader {
  constructor(raw) { this.raw = raw; this.at = 0; }
  take(size) {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.raw.length - this.at) fail("Codec", "truncated canonical body");
    const result = this.raw.subarray(this.at, this.at + size); this.at += size; return result;
  }
  length() {
    let n = 0; let multiplier = 1;
    for (let i = 0; i < 5; i += 1) {
      const b = this.take(1)[0]; n += (b & 127) * multiplier;
      if ((b & 128) === 0) {
        if ((i > 0 && b === 0) || n > 0xffffffff) fail("Codec", "noncanonical field length");
        return n;
      }
      multiplier *= 128;
    }
    return fail("Codec", "oversized field length");
  }
  field() { return this.take(this.length()); }
  end() { if (this.at !== this.raw.length) fail("Codec", "unaccounted canonical body bytes"); }
}
