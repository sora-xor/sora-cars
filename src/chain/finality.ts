import { gameCommitment } from './certificates';
import { NetworkId } from '@iroha/iroha-js/connect-browser';
import { gameHashLiteralV1 } from '@iroha/iroha-js/game';
import { createCertifiedGameSettlementClientV1, encodeGameCertifiedSettlementExportRequestV1, decodeGameCertifiedSettlementExportRequestV1, type GameCertifiedSettlementExportRequestV1, type GameSettlementFileSinkV1 } from '@iroha/iroha-js/game-settlement';

export const SETTLEMENT_DESCRIPTOR_FILE = 'descriptor.json';
/** Thirteen ledger expectations plus one separately pinned verifier artifact identity. */
export interface SettlementVerificationTrust {
  networkId: string; trustedContextId: string; expectedEntryHash: string;
  sessionId: string; profileId: string; outcomeCommitment: string;
  firstHeight: string; sourceHeight: string; sourceBlockHash: string; sourceRevision: string;
  settledHeight: string; settledBlockHash: string; settledRevision: string; expectedVerifierBinarySha256: string;
}
const LEDGER_FLAGS = Object.freeze({ networkId: 'network-id', trustedContextId: 'trusted-context-id', expectedEntryHash: 'expected-entry-hash', sessionId: 'session-id', profileId: 'profile-id', outcomeCommitment: 'outcome-commitment', firstHeight: 'first-height', sourceHeight: 'source-height', sourceBlockHash: 'source-block-hash', sourceRevision: 'source-revision', settledHeight: 'settled-height', settledBlockHash: 'settled-block-hash', settledRevision: 'settled-revision' });
function hash(value: string): string {
  const body = typeof value === 'string' && (/^[0-9a-fA-F]{64}$/.test(value) ? value : /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/.test(value) ? value.slice(5, 69) : '');
  if (!body) throw new Error('Expected an exact marked hash or canonical checked hash literal.');
  const result = gameHashLiteralV1(Uint8Array.from(body.match(/../g)!, part => Number.parseInt(part, 16)));
  if (value.startsWith('hash:') && value !== result) throw new Error('Hash checksum mismatch.');
  return result;
}
function u64(value: string, positive = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 0xffffffffffffffffn || positive && value === '0') throw new Error('Expected a canonical bounded u64 decimal string.');
  return BigInt(value);
}
/** Snapshot before any await. Unknown fields and numeric aliases cannot supply expectations. */
export function settlementVerificationTrust(value: SettlementVerificationTrust): Readonly<SettlementVerificationTrust> {
  if (!value || Object.keys(value).sort().join() !== [...Object.keys(LEDGER_FLAGS), 'expectedVerifierBinarySha256'].sort().join()) throw new Error('Thirteen independent ledger expectations and one verifier artifact hash are required.');
  value = Object.fromEntries([...Object.keys(LEDGER_FLAGS), 'expectedVerifierBinarySha256'].map(key => [key, value[key as keyof SettlementVerificationTrust]])) as unknown as SettlementVerificationTrust;
  const first = u64(value.firstHeight, true), source = u64(value.sourceHeight, true), settled = u64(value.settledHeight, true);
  u64(value.sourceRevision); u64(value.settledRevision);
  if (first > source || source >= settled || settled - first + 1n > 65_536n) throw new Error('Require first <= source < settled within 65,536 unique heights.');
  if (typeof value.expectedVerifierBinarySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.expectedVerifierBinarySha256)) throw new Error('An independently pinned verifier executable SHA-256 from the release build record is required.');
  return Object.freeze({ ...value, networkId: NetworkId.parse(value.networkId).toString(), trustedContextId: hash(value.trustedContextId), expectedEntryHash: hash(value.expectedEntryHash), sessionId: hash(value.sessionId), profileId: hash(value.profileId), outcomeCommitment: gameCommitment(value.outcomeCommitment), sourceBlockHash: hash(value.sourceBlockHash), settledBlockHash: hash(value.settledBlockHash) });
}
/** The wallet retains its locally constructed entry hash and original source revision.
 * Hex transaction hashes normalize to the same checked literal used by CLI expectations.
 */
export function assertSettlementWalletBinding(value: SettlementVerificationTrust, wallet: Pick<SettlementVerificationTrust, 'networkId' | 'sessionId' | 'profileId' | 'expectedEntryHash' | 'outcomeCommitment' | 'sourceRevision'>): void {
  const trust = settlementVerificationTrust(value);
  const expected = { networkId: NetworkId.parse(wallet.networkId).toString(), sessionId: hash(wallet.sessionId), profileId: hash(wallet.profileId), expectedEntryHash: hash(wallet.expectedEntryHash), outcomeCommitment: gameCommitment(wallet.outcomeCommitment), sourceRevision: wallet.sourceRevision };
  u64(wallet.sourceRevision);
  if (Object.entries(expected).some(([key, item]) => trust[key as keyof SettlementVerificationTrust] !== item)) throw new Error('ウォレットで承認した精算と参照値が一致しません。 / Expectations differ from the wallet-approved settlement and original source revision.');
}
export function settlementExportRequest(value: SettlementVerificationTrust): Uint8Array {
  const t = settlementVerificationTrust(value);
  const request: GameCertifiedSettlementExportRequestV1 = { version: 1, network_id: t.networkId, trusted_context_id: t.trustedContextId, first_height: t.firstHeight,
    source: { height: t.sourceHeight, block_hash: t.sourceBlockHash, revision: t.sourceRevision }, settled: { height: t.settledHeight, block_hash: t.settledBlockHash, revision: t.settledRevision },
    session_id: t.sessionId, profile_id: t.profileId, expected_entry_hash: t.expectedEntryHash, outcome_commitment: t.outcomeCommitment };
  const bytes = encodeGameCertifiedSettlementExportRequestV1(request);
  const canonical = encodeGameCertifiedSettlementExportRequestV1(decodeGameCertifiedSettlementExportRequestV1(bytes));
  if (bytes.length !== canonical.length || bytes.some((byte, index) => byte !== canonical[index])) throw new Error('Settlement request is not canonical Norito.');
  return bytes;
}
/** Synchronous preflight before the user-activated picker. */
export function settlementExportOrigin(value: string): string {
  const url = new URL(value), local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || ![url.origin, `${url.origin}/`].includes(value)) throw new Error('Settlement export requires a canonical HTTPS origin outside localhost.');
  return url.origin;
}
/** Endpoint-reported bytes only; the native verifier must independently authenticate them. */
export function collectCertifiedSettlement(toriiUrl: string, trust: SettlementVerificationTrust, sink: GameSettlementFileSinkV1, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}) {
  const origin = settlementExportOrigin(toriiUrl), request = settlementExportRequest(trust);
  return createCertifiedGameSettlementClientV1({ origin, fetchImpl: options.fetchImpl }).downloadSettlement(request, sink, { signal: options.signal });
}
export function settlementVerificationCommand(value: SettlementVerificationTrust, descriptorFile = SETTLEMENT_DESCRIPTOR_FILE, verifierBinary = 'iroha'): string {
  const trust = settlementVerificationTrust(value), quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  if (!descriptorFile || /[\x00-\x1f\x7f]/.test(descriptorFile)) throw new Error('Invalid descriptor path.');
  if (!verifierBinary || /[\x00-\x1f\x7f]/.test(verifierBinary)) throw new Error('Invalid verifier executable path.');
  return ['iroha-verify-pinned', '--binary', quote(verifierBinary), '--sha256', quote(trust.expectedVerifierBinarySha256), '--', '--machine', 'app', 'execution', 'verify-settlement', '--bundle', quote(descriptorFile), ...Object.entries(LEDGER_FLAGS).flatMap(([key, flag]) => [`--${flag}`, quote(trust[key as keyof SettlementVerificationTrust])])].join(' ');
}
