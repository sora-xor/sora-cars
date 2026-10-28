// Local test wallet counterpart, adapted from iroha_js/test/connect.browser.test.js.
// This is a protocol fixture, not a deployed wallet or a ledger authority.
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { ed25519, x25519 } from '@noble/curves/ed25519';
import { blake2b } from '@noble/hashes/blake2b';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
const bytes = value => Buffer.from(value);
const u16 = value => { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; };
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const u64 = value => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const field = value => Buffer.concat([u64(value.length), bytes(value)]);
const structure = values => Buffer.concat(values.map(field));
const variant = (tag, body) => Buffer.concat([u32(tag), field(body)]);
const walletSignature = signature => structure([Buffer.of(0), field(signature)]);
export function fields(buffer) {
  let offset = 0; const result = [];
  while (offset < buffer.length) {
    assert.ok(offset + 8 <= buffer.length, 'complete field length');
    const size = Number(buffer.readBigUInt64LE(offset)); offset += 8;
    assert.ok(Number.isSafeInteger(size) && size <= buffer.length - offset, 'bounded field');
    result.push(buffer.subarray(offset, offset + size)); offset += size;
  }
  return result;
}
export function compactFields(buffer) {
  let offset = 0; const result = [];
  while (offset < buffer.length) {
    let size = 0n, shift = 0n, byte;
    do {
      assert.ok(offset < buffer.length && shift <= 56n, 'bounded compact field length');
      byte = buffer[offset++]; size |= BigInt(byte & 127) << shift; shift += 7n;
    } while (byte & 128);
    assert.ok(size <= BigInt(buffer.length - offset), 'complete compact field');
    result.push(buffer.subarray(offset, offset + Number(size))); offset += Number(size);
  }
  return result;
}
const frame = (preview, seq, kind) => structure([preview.sidBytes, u32(1), u64(seq), kind]);
const tagged = (tag, value) => Buffer.concat([u16(Buffer.byteLength(tag)), bytes(tag), field(value)]);
function approvalPreimage(preview, walletPublicKey, accountId, relayToken) {
  const network = preview.networkId.toBytes();
  return Buffer.concat([
    tagged('domain', bytes('iroha-connect|approve|v1')), tagged('network_id', network),
    tagged('constraints', blake2b(structure([network]), { dkLen: 32 })),
    tagged('sid', preview.sidBytes), tagged('app_pk', preview.appKeyPair.publicKey),
    tagged('wallet_pk', walletPublicKey), tagged('account_id', bytes(accountId)),
    tagged('relay_auth', sha256(Buffer.concat([bytes('iroha-connect|relay-auth|v1'), preview.sidBytes, bytes(relayToken)]))),
  ]);
}
function approval(preview, walletPublicKey, account, relayToken) {
  const signature = ed25519.sign(approvalPreimage(preview, walletPublicKey, account.accountId, relayToken), account.privateKey);
  return frame(preview, 1, variant(0, variant(1, structure([walletPublicKey, field(bytes(account.accountId)), Buffer.of(0), Buffer.of(0), walletSignature(signature)]))));
}
function deriveKeys(preview, privateKey) {
  const shared = x25519.getSharedSecret(privateKey, preview.appKeyPair.publicKey);
  const session = hkdf(sha256, shared, bytes('iroha:x25519:hkdf:v1'), bytes('iroha:x25519:session-key'), 32);
  const salt = blake2b(Buffer.concat([bytes('iroha-connect|salt|'), preview.sidBytes]), { dkLen: 32 });
  return { app: hkdf(sha256, session, salt, bytes('iroha-connect|k_app'), 32), wallet: hkdf(sha256, session, salt, bytes('iroha-connect|k_wallet'), 32) };
}
const nonce = seq => Buffer.concat([Buffer.alloc(4), u64(seq)]);
const aad = (preview, dir, seq) => Buffer.concat([bytes('connect:v1'), preview.sidBytes, Buffer.of(dir), u64(seq), Buffer.of(1)]);
function crc64(data) {
  const mask = (1n << 64n) - 1n, poly = 0xc96c5795d7870f42n; let crc = mask;
  for (const byte of data) { crc ^= BigInt(byte); for (let i = 0; i < 8; i++) crc = crc & 1n ? (crc >> 1n) ^ poly : crc >> 1n; }
  return crc ^ mask;
}
function envelope(payload) {
  const schema = bytes(sha256(bytes('norito:v1:type-name\0iroha_torii_shared::connect::EnvelopeV1'))).subarray(0, 16);
  return Buffer.concat([bytes('NRT0'), Buffer.of(0, 0), schema, Buffer.of(0), u64(payload.length), u64(crc64(payload)), Buffer.of(0), payload]);
}
export function createTestWallet(preview, account, relayToken) {
  const privateKey = new Uint8Array(32).fill(0x55), publicKey = x25519.getPublicKey(privateKey), keys = deriveKeys(preview, privateKey);
  return {
    approve: (boundPreview = preview) => approval(boundPreview, publicKey, account, relayToken),
    request: data => {
      const [sid, dir, sequence, kind] = fields(data);
      assert.deepEqual(sid, preview.sidBytes); assert.equal(dir.readUInt32LE(), 0);
      if (kind.readUInt32LE() === 0) return null;
      assert.equal(kind.readUInt32LE(), 1);
      const [cipherDirection, ciphertextField] = fields(fields(kind.subarray(4))[0]);
      assert.equal(cipherDirection.readUInt32LE(), 0);
      const ciphertext = fields(ciphertextField)[0], seq = Number(sequence.readBigUInt64LE());
      const decipher = createDecipheriv('chacha20-poly1305', keys.app, nonce(seq), { authTagLength: 16 });
      decipher.setAAD(aad(preview, 0, seq)); decipher.setAuthTag(ciphertext.subarray(-16));
      const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
      assert.equal(plain.subarray(0, 4).toString(), 'NRT0');
      const payload = plain.subarray(40); assert.equal(Number(plain.readBigUInt64LE(23)), payload.length); assert.equal(plain.readBigUInt64LE(31), crc64(payload));
      const [envelopeSeq, content] = fields(payload); assert.equal(Number(envelopeSeq.readBigUInt64LE()), seq);
      // App Close notifications are not signature requests.
      if (content.readUInt32LE() === 0) return null;
      assert.equal(content.readUInt32LE(), 2, 'wallet only accepts transaction signing');
      const [wrappedBytes] = fields(content.subarray(4)); const [txBytes] = fields(wrappedBytes);
      return { seq, txBytes };
    },
    signed: (seq, signature) => {
      const payload = Buffer.concat([u32(3), field(walletSignature(signature))]);
      const cipher = createCipheriv('chacha20-poly1305', keys.wallet, nonce(seq), { authTagLength: 16 });
      cipher.setAAD(aad(preview, 1, seq));
      const ciphertext = Buffer.concat([cipher.update(envelope(structure([u64(seq), payload]))), cipher.final(), cipher.getAuthTag()]);
      return frame(preview, seq, variant(1, structure([u32(1), field(ciphertext)])));
    },
  };
}
