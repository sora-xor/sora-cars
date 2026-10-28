import { checkpointTranscriptRoot } from '../chain/races';
import type { GameContext } from '../chain/certificates';
import { encodeRaceValueV1, decodeRaceValueV1 } from '@iroha/iroha-js/race';
import type { RaceReplayV1 } from '@iroha/iroha-js/race';
import { sha256 } from '@noble/hashes/sha256';
import { hex, unhex } from './session';

const CHUNK_BYTES = 8192;
const MAX_BYTES = 512 * 1024;
export interface ReplayChunk {
  kind: 'replay-chunk'; version: 1; transfer: string; index: number; count: number;
  bytes: string;
}
/** Public replay availability over arbitrary peer transports. A caller-pinned checkpoint
 * root checks replay agreement; it does not authenticate ledger inclusion. */
export function replayChunks(replay: RaceReplayV1): ReplayChunk[] {
  const bytes = encodeRaceValueV1('RaceReplayV1', replay);
  if (bytes.length > MAX_BYTES) throw new Error('Replay exceeds the settlement payload budget.');
  const transfer = hex(sha256(bytes)), count = Math.ceil(bytes.length / CHUNK_BYTES);
  return Array.from({ length: count }, (_, index) => ({ kind: 'replay-chunk', version: 1, transfer, index, count, bytes: hex(bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)) }));
}

export class ReplayReceiver {
  #chunks = new Map<number, Uint8Array>();
  #transfer: string | null = null;
  #count = 0;
  constructor(readonly context: GameContext, readonly expectedCheckpointRoot: string) {}
  receive(value: unknown): RaceReplayV1 | null {
    if (!value || typeof value !== 'object') throw new Error('Invalid replay chunk.');
    const chunk = value as ReplayChunk;
    if (Object.keys(chunk).sort().join(',') !== 'bytes,count,index,kind,transfer,version' || chunk.kind !== 'replay-chunk' || chunk.version !== 1 || !/^[0-9a-f]{64}$/.test(chunk.transfer) || !Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > MAX_BYTES / CHUNK_BYTES || !Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= chunk.count || typeof chunk.bytes !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(chunk.bytes) || chunk.bytes.length > CHUNK_BYTES * 2 || (chunk.index < chunk.count - 1 && chunk.bytes.length !== CHUNK_BYTES * 2)) throw new Error('Malformed or oversized replay chunk.');
    if (this.#transfer !== null && (chunk.transfer !== this.#transfer || chunk.count !== this.#count)) throw new Error('Replay transfer changed midstream.');
    this.#transfer = chunk.transfer; this.#count = chunk.count;
    const bytes = unhex(chunk.bytes), prior = this.#chunks.get(chunk.index);
    if (prior && hex(prior) !== chunk.bytes) throw new Error('Conflicting replay chunk.');
    this.#chunks.set(chunk.index, bytes);
    if (this.#chunks.size !== this.#count) return null;
    const length = [...this.#chunks.values()].reduce((sum, part) => sum + part.length, 0);
    const payload = new Uint8Array(length);
    for (let index = 0; index < this.#count; index++) payload.set(this.#chunks.get(index)!, index * CHUNK_BYTES);
    if (hex(sha256(payload)) !== this.#transfer) throw new Error('Replay content digest mismatch.');
    const replay = decodeRaceValueV1('RaceReplayV1', payload) as RaceReplayV1;
    if (checkpointTranscriptRoot(this.context, replay) !== this.expectedCheckpointRoot) throw new Error('Replay does not match the caller-pinned checkpoint transcript root.');
    return replay;
  }
}
