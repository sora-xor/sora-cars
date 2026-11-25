import { bls12_381 } from "@noble/curves/bls12-381";
import { secp256k1 } from "@noble/curves/secp256k1";
import { Field } from "@noble/curves/abstract/modular";
import { assertValidEd25519PublicKey } from "./ed25519Strict.js";
import { AccountAddressError, AccountAddressErrorCode } from "./addressErrors.js";
import { CurveId, getCurveEntryById } from "./curveRegistry.js";

// These are the exact native PARAM_* p/a/b values in signature/gost.rs, not
// parameter sets selected from an external name registry. The source-coupled
// test compares every literal with that Rust owner. Validation below matches
// native parse_public_generic: canonical affine coordinates and the equation;
// that native parser does not separately perform a subgroup multiplication.
const GOST_PARAMETERS = Object.freeze({
  10: Object.freeze([
    "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd97",
    "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd94",
    "00000000000000000000000000000000000000000000000000000000000000a6",
  ]),
  11: Object.freeze([
    "8000000000000000000000000000000000000000000000000000000000000c99",
    "8000000000000000000000000000000000000000000000000000000000000c96",
    "3e1af419a269a5f866a7d3c25c3df80ae979259373ff2b182f49d4ce7e1bbc8b",
  ]),
  12: Object.freeze([
    "9b9f605f5a858107ab1ec85e6b41c8aacf846e86789051d37998f7b9022d759b",
    "9b9f605f5a858107ab1ec85e6b41c8aacf846e86789051d37998f7b9022d7598",
    "000000000000000000000000000000000000000000000000000000000000805a",
  ]),
  13: Object.freeze([
    "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdc7",
    "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdc4",
    "e8c2505dedfc86ddc1bd0b2b6667f1da34b82574761cb0e879bd081cfd0b6265ee3cb090f30d27614cb4574010da90dd862ef9d4ebee4761503190785a71c760",
  ]),
  14: Object.freeze([
    "8000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006f",
    "8000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c",
    "687d1b459dc841457e3e06cf6f5e2517b97c7d614af138bcbf85dc806c4b289f3e965d2db1416d217f8b276fad1ab69c50f78bee1fa3106efb8ccbc7c5140116",
  ]),
});

// SM2 is the cofactor-one PrimeCurve used by native sm2 0.13.3. Native sm.rs
// owns a/b; the prime is a + 3. This checks public material only, never scalars.
const SM2_PARAMETERS = Object.freeze([
  "fffffffeffffffffffffffffffffffffffffffff00000000ffffffffffffffff",
  "fffffffeffffffffffffffffffffffffffffffff00000000fffffffffffffffc",
  "28e9fa9e9d9f5e344d5a9e4bcf6509a7f39789f515ab8f92ddbcbd414d940e93",
]);
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const EQUATIONS = new Map();
const typedArrayByteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), "byteLength",
).get;

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function coordinate(bytes, littleEndian) {
  let value = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8n) | BigInt(bytes[littleEndian ? bytes.length - 1 - index : index]);
  }
  return value;
}

function requireAffineEquation(bytes, littleEndian, parameterHex) {
  let equation = EQUATIONS.get(parameterHex);
  if (!equation) {
    const [p, a, b] = parameterHex.map((hex) => BigInt(`0x${hex}`));
    equation = Object.freeze({ p, a, b, field: Field(p) });
    EQUATIONS.set(parameterHex, equation);
  }
  const { p, a, b, field } = equation;
  const width = bytes.length / 2;
  const x = coordinate(bytes.subarray(0, width), littleEndian);
  const y = coordinate(bytes.subarray(width), littleEndian);
  // Do not let the arithmetic's modular reduction normalize an out-of-field
  // coordinate into an admitted key. Affine infinity has no accepted encoding.
  if (x >= p || y >= p || (x === 0n && y === 0n)) {
    throw new Error("noncanonical or zero affine public key");
  }
  const rhs = field.add(field.add(field.mul(field.sqr(x), x), field.mul(a, x)), b);
  if (!field.eql(field.sqr(y), rhs)) throw new Error("public key is not on the selected curve");
}

function requireCanonicalPoint(bytes, Point) {
  const point = Point.fromHex(bytes);
  point.assertValidity();
  if (point.equals(Point.ZERO)) throw new Error("identity public key is not admitted");
  // Noble accepts several SEC1/BLS forms and may reduce BLS field limbs while
  // decoding. Native keys require the exact compressed encoding, including
  // field range, sign/compression flags, and the prime-order subgroup.
  if (!bytesEqual(point.toRawBytes(true), bytes)) {
    throw new Error("noncanonical compressed public key");
  }
}

function requireSm2Payload(bytes) {
  if (bytes.length < 67) throw new Error("SM2 payload is truncated");
  const distinguishingIdLength = (bytes[0] << 8) | bytes[1];
  if (distinguishingIdLength > 8191 || bytes.length !== 2 + distinguishingIdLength + 65) {
    throw new Error("SM2 distinguishing identifier or public key length is invalid");
  }
  // Native permits empty IDs, NULs, and a UTF-8 BOM. Validate strictly without
  // normalization, stripping, trimming, or changing the signature-bound bytes.
  UTF8.decode(bytes.subarray(2, 2 + distinguishingIdLength));
  const sec1 = bytes.subarray(2 + distinguishingIdLength);
  if (sec1[0] !== 4) throw new Error("SM2 public key must use uncompressed SEC1");
  requireAffineEquation(sec1.subarray(1), false, SM2_PARAMETERS);
}

/**
 * Admit an exact canonical controller-key payload using the browser's primary
 * cryptographic implementation. It never calls a service or native fallback.
 * The shared address codec owns controller policy, framing and SM2 construction
 * normalization; this function admits each resulting key and returns a copy.
 *
 * @param {number} curveId canonical Iroha curve registry ID.
 * @param {Uint8Array} keyBytes canonical public-key payload, including SM2 ID.
 * @returns {Uint8Array} detached admitted public-key bytes.
 */
export function assertCanonicalAccountPublicKey(curveId, keyBytes) {
  const entry = typeof curveId === "number" && Number.isInteger(curveId)
    ? getCurveEntryById(curveId) : null;
  if (!entry) {
    throw new AccountAddressError(AccountAddressErrorCode.UNKNOWN_CURVE, "unknown account curve id");
  }
  try {
    if (!(keyBytes instanceof Uint8Array)) throw new Error("public key must be a Uint8Array");
    const byteLength = typedArrayByteLength.call(keyBytes);
    if (curveId !== CurveId.SM2 && byteLength !== entry.publicKeyLength) {
      throw new Error(`public key must contain ${entry.publicKeyLength} bytes`);
    }
    if (curveId === CurveId.SM2 && (byteLength < 67 || byteLength > 2 + 8191 + 65)) {
      throw new Error("SM2 canonical key payload is outside the native byte bounds");
    }
    // Typed-array construction copies its internal bytes, without invoking a
    // caller-supplied iterator. Check length before allocating or doing math.
    const bytes = new Uint8Array(keyBytes);
    if (bytes.every((byte) => byte === 0)) throw new Error("all-zero public key is not admitted");
    switch (curveId) {
      case CurveId.ED25519:
        assertValidEd25519PublicKey(bytes);
        break;
      case CurveId.MLDSA:
        // Native pqcrypto mldsa65 parses the complete 1952-byte encoding. Its
        // public coefficient packing has no rejected bit pattern; native adds
        // the all-zero rejection above. No signing/keypair validity is implied.
        break;
      case CurveId.SECP256K1:
        requireCanonicalPoint(bytes, secp256k1.ProjectivePoint);
        break;
      case CurveId.BLS_NORMAL:
        requireCanonicalPoint(bytes, bls12_381.G1.ProjectivePoint);
        break;
      case CurveId.BLS_SMALL:
        requireCanonicalPoint(bytes, bls12_381.G2.ProjectivePoint);
        break;
      case CurveId.SM2:
        requireSm2Payload(bytes);
        break;
      default:
        if (!Object.hasOwn(GOST_PARAMETERS, curveId)) throw new Error("curve admission is unavailable");
        requireAffineEquation(bytes, true, GOST_PARAMETERS[curveId]);
    }
    return bytes;
  } catch (cause) {
    throw new AccountAddressError(
      AccountAddressErrorCode.INVALID_PUBLIC_KEY,
      `invalid ${entry.algorithm} account public key: ${cause.message}`,
      { details: { curveId }, cause },
    );
  }
}
