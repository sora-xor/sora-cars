import { EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1 } from '@iroha/iroha-js/game';

export const PROOF_ENVELOPE_LIMIT = EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1;
export const PROOF_REQUEST_JSON_LIMIT = 8 * 1024 * 1024;
// Canonical JSON represents opaque proof bytes as decimal arrays (up to four bytes per item).
// Leave one MiB for the statement, application outcome and worker status framing.
export const PROOF_BUNDLE_JSON_LIMIT = 4 * PROOF_ENVELOPE_LIMIT + 1024 * 1024;

// Eight original slots across 900 rounds plus the replay and complete Stock
// record fit below this byte bound. Export and import use the identical limit.
export const PUBLIC_REPLAY_JSON_LIMIT = 16 * 1024 * 1024;
export function encodePublicReplayJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > PUBLIC_REPLAY_JSON_LIMIT) throw new Error('Public recovery JSON exceeds the 16 MiB bound.');
  return json;
}
