// Exact native leaf values for lifecycle certificate bodies. There is no opaque
// byte escape hatch, account alias resolver, service call, or native addon here.
import { AccountAddress, accountControllerFromAddress, parseCanonicalI105AccountLiteral } from "./address.browser.js";
import { assertCanonicalAccountPublicKey } from "./accountKeyAdmission.browser.js";
import { canonicalizeDomainIdLabel } from "./domainId.js";
import { bytes, concat, equal, fail, field, fixed, fromLittle, little, Reader } from "./gameCertificateBytes.js";

const UTF8 = new TextEncoder();
const TEXT = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
// Native PublicKey stores an Algorithm discriminant, not the address curve ID.
const CURVES = Object.freeze([1, 4, 3, 5, 2, 10, 11, 12, 13, 14, 15]);
const HEADER = Object.freeze({ version: 0, normVersion: 1, extFlag: false });
const MAX_ACCOUNT = 32 * 1024;
const MAX_ACCOUNT_TEXT = 32 * 1024;
const MAX_KEY = 2 + 8191 + 65;

function boundedInteger(raw, width) {
  if (raw.length !== width) fail("Codec", "wrong native leaf integer width");
  return Number(fromLittle(raw));
}
function consume(budget, count) {
  if (!Number.isSafeInteger(count) || count < 0 || count > budget.elements) fail("Bound", "leaf element budget exceeded");
  budget.elements -= count;
}
function encodeKey(curve, value) {
  const tag = CURVES.indexOf(curve);
  if (tag < 0) fail("Signature", "unsupported native public-key algorithm");
  bytes(value, MAX_KEY, "public key");
  let admitted;
  try { admitted = assertCanonicalAccountPublicKey(curve, value); }
  catch { fail("Signature", "invalid canonical native public key"); }
  const raw = concat([Uint8Array.of(tag), admitted]);
  // ConstVec<u8> deliberately contains length-delimited scalar members, unlike Vec<u8>.
  return concat([little(raw.length, 8), ...Array.from(raw, (byte) => field(Uint8Array.of(byte)))], MAX_ACCOUNT);
}
function decodeKey(value, budget) {
  const reader = new Reader(value);
  const count = fromLittle(reader.take(8));
  if (count < 1n || count > BigInt(MAX_KEY + 1)) fail("Bound", "native public-key length");
  consume(budget, Number(count));
  const raw = new Uint8Array(Number(count));
  for (let i = 0; i < raw.length; i += 1) raw[i] = boundedInteger(reader.field(), 1);
  reader.end();
  const curve = CURVES[raw[0]];
  if (curve === undefined) fail("Signature", "unknown native key discriminant");
  let publicKey;
  try { publicKey = assertCanonicalAccountPublicKey(curve, raw.subarray(1)); }
  catch { fail("Signature", "invalid canonical native public key"); }
  return { curve, publicKey };
}
function encodeController(controller) {
  if (controller.tag === 0) return concat([little(0, 4), field(encodeKey(controller.curve, controller.publicKey))], MAX_ACCOUNT - 40);
  const members = controller.members.map((member) => field(concat([
    field(encodeKey(member.curve, member.publicKey)), field(little(member.weight, 2)),
  ])));
  const policy = concat([field(little(controller.version, 1)), field(little(controller.threshold, 2)), field(concat([little(members.length, 8), ...members]))]);
  return concat([little(1, 4), field(policy)], MAX_ACCOUNT - 40);
}
export function canonicalGameCertificateAccountV1(value) {
  if (typeof value !== "string" || value.length > MAX_ACCOUNT_TEXT) fail("Bound", "bounded canonical domainless account required");
  try {
    // This rejects aliases, domain-qualified forms, trimming, and normalized spellings.
    parseCanonicalI105AccountLiteral(value);
    const address = AccountAddress.fromI105(value);
    if (UTF8.encode(address.toI105()).length > MAX_ACCOUNT_TEXT) fail("Bound", "account display bound");
    return { encoded: encodeController(accountControllerFromAddress(address)), canonicalText: address.toI105() };
  } catch (error) {
    if (error?.name === "GameCertificateErrorV1") throw error;
    fail("Codec", "account requires an exact admitted I105 controller identity");
  }
}
function decodeAccount(value, budget) {
  if (value.length + 40 > MAX_ACCOUNT) fail("Bound", "canonical account body bound");
  const reader = new Reader(value);
  const tag = boundedInteger(reader.take(4), 4);
  const payload = reader.field(); reader.end();
  let controller;
  if (tag === 0) controller = { tag, ...decodeKey(payload, budget) };
  else if (tag === 1) {
    const policy = new Reader(payload);
    const version = boundedInteger(policy.field(), 1);
    const threshold = boundedInteger(policy.field(), 2);
    const membersReader = new Reader(policy.field()); policy.end();
    const count = fromLittle(membersReader.take(8));
    if (count === 0n || count > 65535n) fail("Bound", "bounded nonempty multisig members required");
    consume(budget, Number(count));
    const members = [];
    for (let i = 0; i < Number(count); i += 1) {
      const member = new Reader(membersReader.field());
      const key = decodeKey(member.field(), budget);
      const weight = boundedInteger(member.field(), 2); member.end();
      members.push({ ...key, weight });
    }
    membersReader.end();
    controller = { tag, version, threshold, members };
  } else fail("Codec", "unknown account-controller discriminant");
  try {
    const address = new AccountAddress({ ...HEADER, classId: tag }, controller);
    const canonical = encodeController(accountControllerFromAddress(address));
    // Construction must never turn noncanonical ordering or policy into accepted wire bytes.
    if (!equal(canonical, value)) fail("Codec", "noncanonical native account controller");
    const literal = address.toI105();
    if (UTF8.encode(literal).length > MAX_ACCOUNT_TEXT) fail("Bound", "account display bound");
    return literal;
  } catch (error) {
    if (error?.name === "GameCertificateErrorV1") throw error;
    fail("Codec", "invalid native account-controller policy");
  }
}
function name(value) {
  // Native Name::validate_str uses UTF-8 bytes and Rust 1.93.1's exact
  // whitespace/Cc/bidi sets. In particular, NEL is whitespace; BOM is not.
  // Other format characters remain allowed; never normalize returned text.
  // NFC still uses the browser runtime and needs parity qualification against
  // the native owner's pinned ICU algorithm and baked-data fingerprint.
  if (typeof value !== "string" || value.length === 0 || value.length > 255
      || UTF8.encode(value).length > 255 || value.normalize("NFC") !== value
      || /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000@#$\uD800-\uDFFF]/u.test(value)
      || /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(value)) {
    fail("Codec", "noncanonical native Name");
  }
  return value;
}
function label(value) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,63}$/u.test(value) || value.startsWith("-") || value.endsWith("-")
      || (value.slice(2, 4) === "--" && !value.startsWith("xn--"))) fail("Codec", "noncanonical native domain label");
  // Decimal DNS labels are legal native labels; URL parsing would reinterpret
  // them as IPv4. Only ACE labels need the existing browser UTS-46/Bidi check.
  if (value.startsWith("xn--")) {
    try { if (canonicalizeDomainIdLabel(value) !== value) fail("Codec", "noncanonical ACE label"); }
    catch { fail("Codec", "invalid native ACE label"); }
  }
  return value;
}
// Canonical Norito COMPACT_LEN applies to strings; sequence counts stay u64.
function encodeText(value) { return field(UTF8.encode(value)); }
function decodeText(value, budget) {
  const reader = new Reader(value); const count = reader.length();
  if (count > 512) fail("Bound", "native identity text bound");
  consume(budget, Number(count));
  let text;
  try { text = TEXT.decode(reader.take(Number(count))); }
  catch { fail("Codec", "invalid native identity UTF-8"); }
  reader.end(); return text;
}
function encodeNft(value) {
  if (typeof value !== "string" || value.length > 512 || UTF8.encode(value).length > 512) fail("Bound", "native NFT identity text bound");
  const pieces = value.split("$");
  if (pieces.length !== 2) fail("Codec", "exact qualified NFT identity required");
  const domain = pieces[1].split(".");
  if (domain.length !== 2) fail("Codec", "NFT domain and dataspace are explicit");
  return concat([field(concat([field(encodeText(label(domain[0]))), field(encodeText(label(domain[1])))])), field(encodeText(name(pieces[0])))], 1024 - 40);
}
function decodeNft(value, budget) {
  if (value.length + 40 > 1024) fail("Bound", "native NFT encoded bound");
  const reader = new Reader(value); const domain = new Reader(reader.field());
  const domainName = label(decodeText(domain.field(), budget));
  const dataspace = label(decodeText(domain.field(), budget)); domain.end();
  const nftName = name(decodeText(reader.field(), budget)); reader.end();
  const literal = `${nftName}$${domainName}.${dataspace}`;
  if (!equal(encodeNft(literal), value)) fail("Codec", "noncanonical native NFT identity");
  return literal;
}
function ledgerHash(value) {
  const raw = fixed(value, 32, "marked native Hash");
  if ((raw[31] & 1) === 0) fail("Codec", "native Hash marker must be set");
  return raw;
}
export function encodeGameCertificateIdentityV1(kind, value) {
  switch (kind) {
    case "ledgerHash": return ledgerHash(value);
    case "ed25519Key": return encodeKey(1, fixed(value, 32, "Ed25519 key"));
    case "accountId": return canonicalGameCertificateAccountV1(value).encoded;
    case "nftId": return encodeNft(value);
    default: fail("Codec", "unknown closed lifecycle leaf type");
  }
}
export function decodeGameCertificateIdentityV1(kind, value, budget) {
  switch (kind) {
    case "ledgerHash": return ledgerHash(value);
    case "ed25519Key": {
      const decoded = decodeKey(value, budget);
      if (decoded.curve !== 1) fail("Signature", "gameplay key must use Ed25519");
      return decoded.publicKey;
    }
    case "accountId": return decodeAccount(value, budget);
    case "nftId": return decodeNft(value, budget);
    default: fail("Codec", "unknown closed lifecycle leaf type");
  }
}
