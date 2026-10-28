import { RACE_RULES_HASH } from '../game/environment';
import type { RaceReplayV1 } from '@iroha/iroha-js/race';
import type { SignedGameCheckpointV1, GameCommitmentSetV1, GameInputCommitmentV1, GameInputRevealV1 } from '@iroha/iroha-js/game';
import { createRace, copyRace, stepRace, stepRaceBatch, raceFinished, applyRaceDnf } from '../game/engine';
import type { RaceState, ReplayV1 } from '../game/engine';
import { gameTrack, raceContext, stateRoot, checkpointTranscriptRoot, challengeRace } from '../chain/races';
import type { RaceRecord } from '../chain/races';
import { RacePeerSession, BATCH_TICKS, MAX_RACE_TICKS } from './session';
import type { RaceScope, PeerMessage, ProtocolEvent, CertifiedCheckpoint } from './session';
import { RaceMesh } from './mesh';
import type { MeshEvent } from './mesh';
import { replayChunks, ReplayReceiver } from './replay';
import type { ReplayChunk } from './replay';
import { emptyAppearance, validateClubAppearance, type ClubAppearance } from '../game/catalog';

export interface PeerTransport {
  onMessage: (packet: PeerMessage) => void;
  onEvent: (event: MeshEvent) => void;
  onReplayChunk: (slot: number, chunk: unknown) => void;
  onAppearance?: (slot: number, appearance: ClubAppearance) => void;
  readonly connectedSlots: number[];
  broadcast(packet: PeerMessage): void;
  offer(slot: number): Promise<string>;
  accept(packet: string): Promise<string | null>;
  connectSignaling(url: string): Promise<void>;
  sendReplay(slot: number, chunks: readonly ReplayChunk[]): Promise<void>;
  close(): void;
}
export type MultiplayerPhase = 'idle' | 'connecting' | 'synchronizing' | 'racing' | 'waiting' | 'disputed' | 'finished' | 'stopped';
export interface MultiplayerStatus { phase: MultiplayerPhase; reason: string; connectedSlots: number[]; certifiedTick: number; predictedTick: number }
export interface NativeDisputeEvidence {
  reason: string; checkpoint: SignedGameCheckpointV1 | null; frontier: GameCommitmentSetV1 | null;
  commitments: GameInputCommitmentV1[]; revealedInputs: GameInputRevealV1[];
  commitment: GameInputCommitmentV1 | null; revealedInput: GameInputRevealV1 | null;
  signedPackets: readonly PeerMessage[];
  /** Challenge only: checkpoint publication requires a fresh complete ledger record and exact openings.
   * An explicit wallet transaction still pays its bounded chain fee. */
  instructions: object[];
}
export interface MultiplayerConfig {
  /** Authenticated native roster and chain-owned epoch. A signaling service cannot choose these. */
  scope: RaceScope; slot: number; privateKey: Uint8Array; input: () => number;
  names?: readonly string[]; skins?: readonly number[]; iceServers?: RTCIceServer[]; relayOnly?: boolean; publicFeed?: boolean;
  peerTimeoutMs?: number; transport?: PeerTransport;
  appearance?: ClubAppearance;
  /** After a native dispute, include the exact certified prefix plus consensus forced batches. */
  resume?: { replay: RaceReplayV1; activeSlots: readonly number[]; expectedTranscriptRoot: string };
}

/** Replays an authenticated chain checkpoint and its subsequent forced inputs, without local DNF decisions. */
export function replayConsensusFrontier(networkId: string, record: RaceRecord, certifiedPrefix: RaceReplayV1): RaceReplayV1 {
  if (record.network_id !== networkId || certifiedPrefix.track.kind !== record.rules.track.kind || certifiedPrefix.player_count !== record.participants.length) throw new Error('Consensus replay scope mismatch.');
  const replay = structuredClone(certifiedPrefix), cp = record.checkpoint?.checkpoint;
  if (replay.frames.length !== (cp?.tick ?? 0) || cp && checkpointTranscriptRoot(raceContext(record), replay) !== cp.transcript_root) throw new Error('Replay does not match the chain-selected checkpoint.');
  const state = simulateNativeReplay(replay);
  if (cp && stateRoot(raceContext(record), state) !== cp.state_root) throw new Error('Replay differs from the chain-selected checkpoint state.');
  const batches = [...record.forced_batches, ...record.certified_batches.map(batch => ({
    ...batch, dnf_slots: [], controls: batch.inputs.map(bytes => bytes.length ? Array.from({ length: BATCH_TICKS }, (_, tick) => bytes[tick * 2]! | bytes[tick * 2 + 1]! << 8) : Array<number>(BATCH_TICKS).fill(0)),
  }))].sort((a, b) => a.start_tick - b.start_tick);
  if (batches.some((batch, index) => index > 0 && batch.start_tick === batches[index - 1]!.start_tick)) throw new Error('Repeated accepted transcript interval.');
  for (const batch of batches) {
    if (batch.start_tick < replay.frames.length) continue;
    if (batch.start_tick !== replay.frames.length) throw new Error('Missing forced transcript interval.');
    if (batch.dnf_slots.length) {
      replay.dnf_events.push({ tick: batch.start_tick, slots: [...batch.dnf_slots] });
      applyRaceDnf(state, batch.dnf_slots);
    }
    // Apply removals at the terminal boundary even when the preceding driving
    // batch already finished the race. Later ledger timeouts remain in the
    // dispute history; they add neither driving frames nor replay forfeits.
    if (raceFinished(state)) break;
    for (let tick = 0; tick < BATCH_TICKS; tick++) {
      const controls = batch.controls.map(row => row[tick]!);
      replay.frames.push({ tick: batch.start_tick + tick, controls }); stepRace(state, controls);
    }
  }
  if (replay.frames.length !== record.next_tick && !(raceFinished(state) && replay.frames.length < record.next_tick)) throw new Error('Replay has not reached the consensus frontier.');
  simulateNativeReplay(replay);
  return replay;
}
export function simulateNativeReplay(replay: RaceReplayV1): RaceState {
  return simulateNativeReplayWithCheckpoints(replay, []).state;
}
/** One deterministic walk; snapshots precede consensus removals at their boundary. */
export function simulateNativeReplayWithCheckpoints(replay: RaceReplayV1, checkpointTicks: readonly number[]): { state: RaceState; checkpointStates: RaceState[] } {
  if (checkpointTicks.length > 900 || checkpointTicks.some((tick, index) => !Number.isInteger(tick) || tick < 0 || tick > replay.frames.length || index > 0 && tick <= checkpointTicks[index - 1]!)) throw new Error('Retained checkpoints must be ordered, unique and within the physical replay.');
  const checkpointStates: RaceState[] = [];
  let checkpointIndex = 0;
  const state = createRace(gameTrack(replay.track), replay.player_count);
  const seen = new Set<number>();
  let eventIndex = 0;
  for (let tick = 0; tick <= replay.frames.length; tick++) {
    if (checkpointTicks[checkpointIndex] === tick) { checkpointStates.push(copyRace(state)); checkpointIndex++; }
    const event = replay.dnf_events[eventIndex];
    if (event && event.tick < tick) throw new Error('Noncanonical DNF event order.');
    if (event?.tick === tick) {
      if (event.slots.some(slot => seen.has(slot))) throw new Error('Repeated native DNF slot.');
      applyRaceDnf(state, event.slots); event.slots.forEach(slot => seen.add(slot)); eventIndex++;
    }
    if (tick < replay.frames.length) {
      const frame = replay.frames[tick]!;
      if (frame.tick !== tick || raceFinished(state)) throw new Error('Replay contains missing or trailing terminal frames.');
      stepRace(state, frame.controls);
    }
  }
  if (eventIndex !== replay.dnf_events.length) throw new Error('DNF event lies beyond the replay.');
  return { state, checkpointStates };
}

/** Every peer simulates the same revealed controls. Prediction is render-only and never gets signed. */
export class MultiplayerRaceController {
  onState: (authoritative: RaceState, predicted: RaceState) => void = () => {};
  onStatus: (status: MultiplayerStatus) => void = () => {};
  onCheckpoint: (checkpoint: SignedGameCheckpointV1) => void = () => {};
  onDispute: (evidence: NativeDisputeEvidence) => void = () => {};
  onSignal: (packet: string) => void = () => {};
  onReplay: (slot: number, replay: RaceReplayV1) => void = () => {};
  readonly session: RacePeerSession;
  readonly transport: PeerTransport;
  #config: MultiplayerConfig;
  #authoritative: RaceState;
  #predicted: RaceState;
  #candidate: RaceState | null = null;
  #phase: MultiplayerPhase = 'idle';
  #timer: ReturnType<typeof setInterval> | null = null;
  #key: Uint8Array;
  #pending: number[] = [];
  #lastRemote: number[];
  #committed = false;
  #anchored = false;
  #anchorSent = false;
  #startedAt = 0;
  #lastProgress = 0;
  #lastCheckpoint: SignedGameCheckpointV1 | null = null;
  #receivers = new Map<number, ReplayReceiver>();
  #lastReason = '';
  #appearances: ClubAppearance[];

  constructor(config: MultiplayerConfig) {
    if (config.resume && checkpointTranscriptRoot(config.scope, config.resume.replay) !== config.resume.expectedTranscriptRoot) throw new Error('Resume transcript root mismatch.');
    if (config.peerTimeoutMs !== undefined && (!Number.isFinite(config.peerTimeoutMs) || config.peerTimeoutMs < 1000)) throw new Error('Peer timeout must allow at least one second.');
    this.#config = { ...config, privateKey: new Uint8Array() };
    this.#key = config.privateKey.slice();
    this.#appearances = config.scope.participants.map((_, slot) => slot === config.slot ? validateClubAppearance(config.appearance ?? emptyAppearance()) : emptyAppearance());
    this.session = new RacePeerSession(config.scope, config.slot, config.privateKey, config.resume);
    this.#authoritative = config.resume ? simulateNativeReplay(config.resume.replay) : createRace(gameTrack(config.scope.track), config.scope.participants.length);
    this.#predicted = copyRace(this.#authoritative);
    this.#lastRemote = config.scope.participants.map(() => 0);
    this.transport = config.transport ?? new RaceMesh({ scope: this.session.scope, slot: config.slot, roster: config.scope.participants, privateKey: config.privateKey, iceServers: config.iceServers, relayOnly: config.relayOnly, publicFeed: config.publicFeed, appearance: this.#appearances[config.slot] });
    this.transport.onAppearance = (slot, appearance) => { this.#appearances[slot] = validateClubAppearance(appearance); };
    this.session.send = packet => this.transport.broadcast(packet);
    this.session.onEvent = event => this.#protocol(event);
    this.transport.onMessage = packet => {
      try { this.session.receive(packet); }
      catch (error) { this.#status(this.#phase, `Rejected peer packet: ${error instanceof Error ? error.message : String(error)}`); }
    };
    this.transport.onEvent = event => {
      if (event.type === 'signal') this.onSignal(event.packet);
      else if (event.type === 'error') this.#status(this.#phase, event.reason);
      else { this.#status(this.#phase, `Racer ${event.slot + 1}: ${event.status}.`); this.#tryAnchor(); }
    };
    this.transport.onReplayChunk = (slot, chunk) => {
      const receiver = this.#receivers.get(slot); if (!receiver) return;
      try { const replay = receiver.receive(chunk); if (replay) { this.#receivers.delete(slot); this.onReplay(slot, replay); } }
      catch (error) { this.#receivers.delete(slot); this.#status(this.#phase, `Replay rejected: ${error instanceof Error ? error.message : String(error)}`); }
    };
  }
  get state(): RaceState { return copyRace(this.#authoritative); }
  get appearances(): ClubAppearance[] { return this.#appearances.map(a => ({ ...a })); }
  get predictedState(): RaceState { return copyRace(this.#predicted); }
  get status(): MultiplayerStatus { return { phase: this.#phase, reason: this.#lastReason, connectedSlots: [...this.transport.connectedSlots], certifiedTick: this.#authoritative.tick, predictedTick: this.#predicted.tick }; }
  get checkpoint(): SignedGameCheckpointV1 | null { return this.#lastCheckpoint ? structuredClone(this.#lastCheckpoint) : null; }

  start(): void {
    if (this.#phase !== 'idle') throw new Error('Controller can be started only once.');
    this.#startedAt = this.#lastProgress = performance.now();
    this.#status('connecting', 'Establishing authenticated connections with the native race roster.');
    this.#tryAnchor();
    this.#timer = setInterval(() => { this.tick(); }, 1000 / 30);
  }
  /** One 30 Hz capture step, also exposed for deterministic transport tests. */
  tick(control = this.#config.input()): void {
    if (['idle', 'disputed', 'finished', 'stopped'].includes(this.#phase)) return;
    if (!Number.isInteger(control) || control < 0 || control > 63) throw new Error('Invalid six-bit race controls.');
    this.#tryAnchor();
    const now = performance.now();
    if (now - this.#lastProgress > (this.#config.peerTimeoutMs ?? 15_000) && now - this.#startedAt > (this.#anchored ? 0 : 30_000)) {
      this.#dispute('Peers did not complete the signed frontier. Native consensus deadlines decide recovery.', []); return;
    }
    if (!this.#anchored) return;
    // At most two batches are predicted. Delayed peers cannot grow unbounded input or rollback history.
    if (this.#pending.length < BATCH_TICKS * 2 && this.#authoritative.tick + this.#pending.length < MAX_RACE_TICKS) this.#pending.push(control);
    this.#commitIfReady();
    this.#predict();
    this.#emitState();
    if (this.#pending.length === BATCH_TICKS * 2) this.#status('waiting', 'Waiting for every active racer to certify the input batch.');
  }
  #tryAnchor(): void {
    if (this.#phase === 'idle' || this.#anchorSent || ['disputed', 'finished', 'stopped'].includes(this.#phase)) return;
    const active = this.#config.resume?.activeSlots ?? this.#config.scope.participants.map(p => p.slot);
    if (active.some(slot => slot !== this.#config.slot && !this.transport.connectedSlots.includes(slot))) return;
    this.#anchorSent = true;
    this.#status('synchronizing', 'Certifying the exact initial simulation state.');
    this.session.anchor(stateRoot(this.#config.scope, this.#authoritative));
  }
  #commitIfReady(): void {
    if (!this.#anchored || this.#committed || this.#pending.length < BATCH_TICKS || ['disputed', 'finished', 'stopped'].includes(this.#phase)) return;
    this.#committed = true;
    this.session.commit(this.#pending.slice(0, BATCH_TICKS));
  }
  #protocol(event: ProtocolEvent): void {
    if (['disputed', 'stopped'].includes(this.#phase)) return;
    if (event.type === 'anchored') {
      this.#lastCheckpoint = event.checkpoint; this.#anchored = true; this.#lastProgress = performance.now();
      this.#status('racing', 'Initial state certified. Inputs are signed by the race-scoped gameplay keys.');
      this.onCheckpoint(structuredClone(event.checkpoint));
    } else if (event.type === 'inputs') {
      const candidate = copyRace(this.#authoritative);
      stepRaceBatch(candidate, Array.from({ length: BATCH_TICKS }, (_, tick) => event.controls.map(row => row[tick]!)));
      if (candidate.tick !== this.#authoritative.tick + BATCH_TICKS) { this.#dispute('Simulation did not consume exactly the authenticated batch.', []); return; }
      this.#candidate = candidate;
      this.#lastRemote = event.controls.map(row => row[BATCH_TICKS - 1]!);
      this.session.checkpoint(stateRoot(this.#config.scope, candidate), raceFinished(candidate));
    } else if (event.type === 'certified') this.#certified(event.checkpoint);
    else if (event.type === 'rollback') this.#dispute(event.reason, event.evidence);
    else this.#status(this.#phase, event.reason);
  }
  #certified(checkpoint: CertifiedCheckpoint): void {
    if (!this.#candidate || this.#candidate.tick !== checkpoint.tick || stateRoot(this.#config.scope, this.#candidate) !== checkpoint.stateRoot) { this.#dispute('Checkpoint does not certify the local deterministic simulation.', checkpoint.signatures); return; }
    this.#authoritative = this.#candidate; this.#candidate = null;
    this.#lastCheckpoint = checkpoint.native;
    this.#pending.splice(0, BATCH_TICKS); this.#committed = false; this.#lastProgress = performance.now();
    this.#predict(); this.#emitState(); this.onCheckpoint(structuredClone(checkpoint.native));
    if (raceFinished(this.#authoritative)) {
      if (this.#timer !== null) clearInterval(this.#timer); this.#timer = null;
      this.#pending = []; this.#predicted = copyRace(this.#authoritative);
      this.#status('finished', 'Every active racer certified the terminal transcript. Native execution proof settlement is next.');
    } else { this.#status('racing', 'Authenticated race in progress.'); this.#commitIfReady(); }
  }
  #predict(): void {
    this.#predicted = copyRace(this.#authoritative);
    for (const control of this.#pending) {
      const words = [...this.#lastRemote]; words[this.#config.slot] = control;
      stepRace(this.#predicted, words);
    }
  }
  #dispute(reason: string, signedPackets: readonly PeerMessage[]): void {
    if (this.#phase === 'disputed') return;
    if (this.#timer !== null) clearInterval(this.#timer); this.#timer = null;
    this.#predicted = copyRace(this.#authoritative); this.#candidate = null;
    const checkpoint = this.checkpoint, frontier = this.session.pendingFrontier;
    const instructions = [challengeRace(this.#config.scope, this.#config.scope.epoch, this.#config.slot, this.#key)];
    // Publication must be built against a fresh complete ledger record to
    // include openings for the exact old pending frontier. The UI does that
    // after refreshing; these transport-only instructions cannot guess it.
    const evidence: NativeDisputeEvidence = { reason, checkpoint, frontier, commitments: this.session.nativeInputCommitments, revealedInputs: this.session.retainedRevealedInputs, commitment: this.session.nativeInputCommitment, revealedInput: this.session.nativeRevealedInput, signedPackets: structuredClone(signedPackets), instructions };
    this.#status('disputed', reason); this.#emitState(); this.onDispute(evidence);
  }
  #status(phase: MultiplayerPhase, reason: string): void { if (this.#phase === phase && this.#lastReason === reason) return; this.#phase = phase; this.#lastReason = reason; this.onStatus(this.status); }
  #emitState(): void { this.onState(this.state, this.predictedState); }
  createOffer(slot: number): Promise<string> { return this.transport.offer(slot); }
  acceptSignal(packet: string): Promise<string | null> { return this.transport.accept(packet); }
  async connectSignaling(url: string): Promise<void> {
    await this.transport.connectSignaling(url);
    // Every higher slot must subscribe first; manual offers remain available if a relay drops this attempt.
    await Promise.all(this.#config.scope.participants.filter(p => p.slot > this.#config.slot).map(p => this.createOffer(p.slot)));
  }
  expectReplay(slot: number, expectedTranscriptRoot: string): void {
    if (!this.#config.scope.participants[slot] || slot === this.#config.slot) throw new Error('Invalid replay peer.');
    this.#receivers.set(slot, new ReplayReceiver(this.#config.scope, expectedTranscriptRoot));
  }
  sendReplay(slot: number): Promise<void> { return this.transport.sendReplay(slot, replayChunks(this.exportNativeReplay())); }
  exportNativeReplay(): RaceReplayV1 { return this.session.exportNativeReplay(); }
  exportReplay(): ReplayV1 {
    const replay = this.exportNativeReplay();
    return { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: gameTrack(replay.track), names: this.#config.scope.participants.map((p, i) => this.#config.names?.[i] ?? p.account), skins: this.#config.scope.participants.map((_, i) => this.#config.skins?.[i] ?? 0), appearances: this.appearances, inputs: replay.frames.map(frame => [...frame.controls]), dnfEvents: structuredClone(replay.dnf_events), savedAt: new Date().toISOString(), source: 'multiplayer' };
  }
  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer); this.#timer = null;
    this.transport.close(); this.session.close(); this.#key.fill(0); this.#receivers.clear();
    this.#status('stopped', 'Peer session closed. The native escrow lifecycle remains on-chain.');
  }
}
