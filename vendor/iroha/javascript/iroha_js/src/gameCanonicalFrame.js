// Internal canonical frame owner shared by closed certificate and adapter codecs.
import { sha256 } from "@noble/hashes/sha256";
import { crc64Xz } from "./crc64Xz.js";
import { bytes, concat, equal, fail, fromLittle, little } from "./gameCertificateBytes.js";
export function canonicalTypeId(typeName) {
  return sha256(new TextEncoder().encode(`norito:v1:type-name\0${typeName}`)).slice(0, 16);
}
export function frameCanonicalPayload(id, payload, cap) {
  bytes(payload, cap - 40, "canonical payload");
  return concat([Uint8Array.of(78, 82, 84, 48, 0, 0), id, Uint8Array.of(0), little(payload.length, 8), little(crc64Xz(payload), 8), Uint8Array.of(2), payload], cap);
}
export function unframeCanonicalPayload(id, value, cap) {
  bytes(value, cap, "canonical frame");
  if (value.length < 40) fail("Codec", "missing canonical Norito header");
  const frame = Uint8Array.from(value), payload = frame.subarray(40);
  if (!equal(frame.subarray(0, 6), Uint8Array.of(78, 82, 84, 48, 0, 0)) || !equal(frame.subarray(6, 22), id)
      || frame[22] !== 0 || frame[39] !== 2 || fromLittle(frame.subarray(23, 31)) !== BigInt(payload.length)
      || fromLittle(frame.subarray(31, 39)) !== crc64Xz(payload)) fail("Codec", "noncanonical Norito frame or schema");
  return payload;
}
