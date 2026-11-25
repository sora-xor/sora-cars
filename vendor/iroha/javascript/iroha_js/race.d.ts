export type RaceTrackV1 = { kind: 'neon_tokyo' | 'harbor' | 'sakura'; value: null };
export interface RaceReplayV1 { track: RaceTrackV1; player_count: number; frames: { tick: number; controls: number[] }[]; dnf_events: { tick: number; slots: number[] }[] }
export function encodeRaceValueV1(name: string, value: unknown): Uint8Array;
/** Bare values: signed i64 fields decode to safe numbers, otherwise canonical decimal strings. */
export function decodeRaceValueV1(name: string, bytes: Uint8Array): unknown;
export function raceHashLiteralV1(bytes: Uint8Array): string;

export interface RaceCarStateV1 { progress_mm: string | number | bigint; lateral_mm: number; speed_mm_per_tick: number; lateral_velocity_mm_per_tick: number; boost_energy: number; finish_tick: number | null; dnf_tick: number | null }
export interface RaceStateV1 { tick: number; track: RaceTrackV1; cars: RaceCarStateV1[] }
export interface RaceStandingV1 { slot: number; finish_tick: number | null; dnf_tick: number | null; progress_mm: string | number | bigint }
export interface RaceResultV1 { ticks: number; standings: RaceStandingV1[]; winners: number[] }
/** Canonical eligibility-first policy. Validates bounds, not reachability or authenticated ledger state. */
export function deriveRaceResultV1(state: RaceStateV1): RaceResultV1;
/** Frozen stock terminal boundaries, with no automatic termination of an unfinished solo practice car. */
export function isRaceTerminalStateV1(state: RaceStateV1): boolean;
export interface RacePublicInputsV1 { network_id: string; race_id: string; admission_commitment: string; rules_hash: string; track: RaceTrackV1; transcript_root: string; dispute_commitment: string; result: RaceResultV1 }
export type { ExecutionProofEnvelopeV1 } from './game.js';
export function raceInputPayloadV1(controls: number[]): number[];
export function raceControlsFromPayloadV1(payload: number[]): number[];
/** Physical driving replay only; accepted history (including later removals) is separate mandatory prover evidence. */
export function raceGameTranscriptV1(replay: RaceReplayV1): import('./game.js').GameTranscriptV1;

/** Observation height is explicit chronology context and is excluded from record identity. */
/** Public states for every retained checkpoint, in ledger order; native admission validates completeness. */
export interface RaceProverRequestV1 { history_evidence: import('./game-replay.js').GameReplayEvidenceV1; source_record: import('./game.js').GameSessionRecordV1; observation_height: string | number | bigint; replay: RaceReplayV1; checkpoint_states: RaceStateV1[] }
/** Validates/copies transport fields; the native prover derives and checks the bound statement. */
export function buildRaceProverRequestV1(value: RaceProverRequestV1): RaceProverRequestV1;
export interface RaceProofPayloadV1 { history_evidence: import('./game-replay.js').GameReplayEvidenceV1; accepted_through_tick: number; manifest: import('./game.js').GameManifestV1; admission: import('./game.js').GameAdmissionBodyV1; outcome: import('./game.js').GameOutcomeV1; relation_inputs: RacePublicInputsV1; replay: RaceReplayV1; final_state: RaceStateV1; checkpoint_states: RaceStateV1[]; stark_bytes: number[] }

/** Economic projection retains removals through the accepted frontier separately from physical finish state. */
export interface RaceSettlementStandingV1 { slot: number; finish_tick: number | null; dnf_tick: number | null; progress_mm: string | number | bigint }
export interface RaceSettlementResultV1 { physical_terminal_tick: number; accepted_through_tick: number; standings: RaceSettlementStandingV1[]; winners: number[] }

/** Closed canonical Norito frames for native adapter state/outcomes. */
export function encodeRaceFrameV1(name: "RaceStateV1", value: RaceStateV1): Uint8Array;
export function encodeRaceFrameV1(name: "RaceSettlementResultV1", value: RaceSettlementResultV1): Uint8Array;
export function decodeRaceFrameV1(name: "RaceStateV1", frame: Uint8Array): RaceStateV1;
export function decodeRaceFrameV1(name: "RaceSettlementResultV1", frame: Uint8Array): RaceSettlementResultV1;

/** Canonical native proof payload frame. Encoding/decoding does not verify the proof. */
export function encodeRaceFrameV1(name: "RaceProofPayloadV1", value: RaceProofPayloadV1): Uint8Array;
/** Rejects bare values, wrong schemas, noncanonical framing and oversized payloads. */
export function decodeRaceFrameV1(name: "RaceProofPayloadV1", frame: Uint8Array): RaceProofPayloadV1;
