/** Browser-only native V1 certificate primitives. These authenticate exact bytes,
 * not ledger origin, finalized inclusion, slot authority, accepted history,
 * an execution proof, or permission to spend funds. No prehash fallback exists.
 */
import { sha3_384 } from "@noble/hashes/sha3";
import { networkIdBytes } from "./networkId.js";
import { verifyEd25519Strict } from "./ed25519Strict.js";
import { bytes, concat, equal, fail, fixed, formatGameCommitmentLiteralV1, little } from "./gameCertificateBytes.js";
import { decodeGameCertificateBodyV1, encodeGameCertificateBodyV1, schemaFor } from "./gameCertificateCodec.js";
export { prepareGameTranscriptV1, extendGameTranscriptV1 } from "./gameTranscript.js";
export { NetworkId } from "./networkId.js";
export { GameCertificateErrorV1, parseGameCommitmentLiteralV1, formatGameCommitmentLiteralV1, parseGameNonceLiteralV1, formatGameNonceLiteralV1, decodeGameCommitmentJsonV1 } from "./gameCertificateBytes.js";
export { decodeGameCertificateBodyV1, encodeGameCertificateBodyV1 } from "./gameCertificateCodec.js";

const PREFIX = new TextEncoder().encode("iroha:game:certificate:v1\0");
const OVERHEAD = 97;
// Reserved purpose numbers are deliberately not admitted without their native body codec.
const PURPOSES = new Map([
  [1, [0, "GameInputPreimageV1"]],
  [3, [0, "GameAdapterStateCommitmentBodyV1"]],
  [4, [0, "GameManifestV1"]],
  [5, [0, "GameAdmissionBodyV1"]],
  [6, [0, "GameDisputeCommitmentBodyV1"]],
  [7, [0, "GameOutcomeCommitmentBodyV1"]],
  [8, [0, "GameCheckpointCertificateBodyV1"]],
  [9, [0, "GameCommitmentSetCertificateBodyV1"]],
  [11, [0, "GameTranscriptSeedBodyV1"]],
  [12, [0, "GameTranscriptBatchLinkBodyV1"]],
  [13, [0, "GameTranscriptRemovalLinkBodyV1"]],
  [14, [0, "GameTranscriptRootBodyV1"]],
  [101, [1, "GameInputCommitmentCertificateBodyV1"]],
  [102, [1, "GameInputPreimageV1"]],
  [103, [1, "GameCommitmentSetCertificateBodyV1"]],
  [104, [1, "GameCheckpointCertificateBodyV1"]],
  [105, [1, "GameChallengeCertificateBodyV1"]],
  [106, [1, "GameInvitationCertificateBodyV1"]],
]);
function purpose(value) {
  if (!Number.isInteger(value) || !PURPOSES.has(value)) fail("Frame", "unsupported native certificate purpose");
  const [operation, type] = PURPOSES.get(value);
  return { operation, type, bodyCap: schemaFor(type).cap };
}
function identity(context) {
  if (context === null || typeof context !== "object") fail("Frame", "independently selected certificate context required");
  const network = networkIdBytes(context.networkId, "expected networkId");
  const session = fixed(context.sessionId, 32, "expected sessionId");
  if ((session[31] & 1) === 0) fail("Frame", "sessionId must retain its native hash marker");
  return { network, session };
}
function header(context, id, length) {
  const kind = purpose(id);
  const { network, session } = identity(context);
  return concat([PREFIX, Uint8Array.of(kind.operation), little(id, 2), network, session, little(length, 4)], OVERHEAD);
}
/** Raw FIPS202 SHA3-384, with no marking, truncation, field reduction or implicit protocol framing. */
export function rawSha3_384V1(value) {
  return Uint8Array.from(sha3_384(Uint8Array.from(bytes(value, 8 * 1024 * 1024, "SHA3-384 input"))));
}
/** Build exact domain-separated bytes from a closed typed canonical Norito body.
 * Operation 0 frames are commitment preimages, never signing bytes.
 */
export function encodeGameCertificateFrameV1(context, id, body) {
  const kind = purpose(id);
  // Validate independently supplied identity before encoding caller-owned data.
  identity(context);
  const canonical = encodeGameCertificateBodyV1(kind.type, body);
  return concat([header(context, id, canonical.length), canonical], kind.bodyCap + OVERHEAD);
}
/** Strict typed decode under a context chosen independently of the untrusted frame.
 * Returned claims remain untrusted; current scope/epoch/roster and ledger checks are separate.
 */
export function decodeGameCertificateFrameV1(value, context, id) {
  const kind = purpose(id);
  bytes(value, kind.bodyCap + OVERHEAD, "certificate frame");
  if (value.length < OVERHEAD) fail("Frame", "truncated certificate header");
  const frame = Uint8Array.from(value);
  if (!equal(frame.subarray(0, OVERHEAD), header(context, id, frame.length - OVERHEAD))) fail("Frame", "certificate frame differs from expected context");
  return decodeGameCertificateBodyV1(kind.type, frame.subarray(OVERHEAD));
}
/** Commit a typed purpose-0 body, streaming the exact header and canonical body into raw SHA3. */
export function gameCertificateCommitmentV1(context, id, body) {
  const kind = purpose(id);
  if (kind.operation !== 0) fail("Frame", "signing purpose is not a commitment purpose");
  identity(context);
  const canonical = encodeGameCertificateBodyV1(kind.type, body);
  return formatGameCommitmentLiteralV1(sha3_384.create().update(header(context, id, canonical.length)).update(canonical).digest());
}
/** Verify direct pure-Ed25519 signature over the complete canonical signing frame.
 * Malformed/context-mismatched frames throw; an invalid strict signature returns false.
 * This does not establish that the key is authorized for the claimed original slot.
 */
export function verifyGameCertificateSignatureV1(value, signature, publicKey, context, id) {
  const kind = purpose(id);
  if (kind.operation !== 1) fail("Frame", "commitment preimages cannot be verified as signing messages");
  bytes(value, kind.bodyCap + OVERHEAD, "certificate frame");
  const frame = Uint8Array.from(value);
  decodeGameCertificateFrameV1(frame, context, id);
  // Bound and snapshot before calling the shared strict verifier. Shared input is never allowed.
  try {
    const sig = fixed(signature, 64, "Ed25519 signature");
    const key = fixed(publicKey, 32, "Ed25519 public key");
    return verifyEd25519Strict(frame, sig, key);
  } catch { return false; }
}
