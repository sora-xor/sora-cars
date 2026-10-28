import { RACE_PROFILE_ID } from '../game/environment';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { raceInputPayloadV1, raceGameTranscriptV1 } from '@iroha/iroha-js/race';
import { extendGameTranscriptV1, formatGameNonceLiteralV1 } from '@iroha/iroha-js/game-certificates';
import { prepareRaceTranscript, certificateScope, gameCommitment, inputDigest, inputSigningFrame, revealSigningFrame, checkpointSigningFrame, checkpointId, frontierSigningFrame, frontierId } from '../chain/certificates';
import type { GameActiveScopeV1, GameCheckpointV1, GameCommitmentSetV1, SignedGameCheckpointV1, GameInputCommitmentV1, GameInputRevealV1 } from '@iroha/iroha-js/game';
import type { PreparedGameTranscriptV1 } from '@iroha/iroha-js/game-certificates';
import type { RaceTrackV1, RaceReplayV1 } from '@iroha/iroha-js/race';

export const BATCH_TICKS = 6;
export const MAX_RACERS = 8;
export const MAX_RACE_TICKS = 5400;
const DOMAIN = 'sora-cars/peer/v1';
const HEX32 = /^[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{128}$/;
export const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
export function unhex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) throw new Error('Noncanonical hexadecimal bytes.');
  return Uint8Array.from(value.match(/../g)!, (pair) => parseInt(pair, 16));
}
const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const digest = (value: unknown): string => hex(sha256(encode(value)));

/** Must be taken from the finalized native race roster, never from the signaling relay. */
export interface RaceParticipant { slot: number; account: string; inputKeyHex: string }
export interface RaceScope { networkId: string; raceId: string; profileId: string; activeScope: GameActiveScopeV1; participants: readonly RaceParticipant[]; track: RaceTrackV1; epoch: number }
export interface InputKeyPair { publicKeyHex: string; privateKey: Uint8Array }
export function createInputKey(): InputKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  return { privateKey, publicKeyHex: hex(ed25519.getPublicKey(privateKey)) };
}
type MessageKind = 'anchor' | 'commit' | 'frontier' | 'reveal' | 'checkpoint';
export interface PeerMessage {
  v: 1; scope: string; slot: number; round: number; previous: string; kind: MessageKind;
  body: readonly unknown[]; signature: string;
}
export interface CertifiedCheckpoint {
  round: number; tick: number; previous: string; commitmentsRoot: string; inputsRoot: string;
  stateRoot: string; root: string; signatures: readonly PeerMessage[];
  native: SignedGameCheckpointV1;
}
export type ProtocolEvent =
  | { type: 'anchored'; checkpoint: SignedGameCheckpointV1 }
  | { type: 'inputs'; round: number; controls: readonly (readonly number[])[]; inputsRoot: string }
  | { type: 'certified'; checkpoint: CertifiedCheckpoint }
  | { type: 'rollback'; tick: number; reason: string; evidence: readonly PeerMessage[] }
  | { type: 'error'; reason: string };
interface Round {
  commits: Map<number, PeerMessage>; frontiers: Map<number, PeerMessage>;
  reveals: Map<number, PeerMessage>; checkpoints: Map<number, PeerMessage>;
  localSecret?: { controls: number[]; salt: string };
  preparedTranscript?: PreparedGameTranscriptV1;
  commitmentsRoot?: string; inputsRoot?: string; expectedStateRoot?: string; expectedTerminal?: boolean; frontierAgreementChecked: boolean; delivered: boolean; failed: boolean;
}
const makeRound = (): Round => ({ commits: new Map(), frontiers: new Map(), reveals: new Map(), checkpoints: new Map(), frontierAgreementChecked: false, delivered: false, failed: false });

/** Signed commit/frontier/reveal protocol. Transport has no authority over the accepted transcript. */
export class RacePeerSession {
  readonly scope: string;
  readonly roster: readonly RaceParticipant[];
  readonly slot: number;
  readonly checkpoints: CertifiedCheckpoint[] = [];
  readonly transcript: number[][];
  send: (message: PeerMessage) => void = () => {};
  onEvent: (event: ProtocolEvent) => void = () => {};
  #key: Uint8Array;
  #round = makeRound();
  #certifiedReveals: GameInputRevealV1[] = [];
  #previous: string;
  #roundNumber = 0;
  #closed = false;
  #config: RaceScope;
  #transcriptRoot: string;
  #preparedTranscript: PreparedGameTranscriptV1;
  #future: PeerMessage[] = [];
  #anchors = new Map<number, PeerMessage>();
  #anchorRoot: string | null = null;
  #anchorCertificate: SignedGameCheckpointV1 | null = null;
  #activeSlots: number[];
  #dnfEvents: RaceReplayV1['dnf_events'];
  #initialTick: number;

  constructor(scope: RaceScope, slot: number, privateKey: Uint8Array | null, initial?: { replay: RaceReplayV1; activeSlots: readonly number[]; checkpoint?: SignedGameCheckpointV1 }) {
    if (scope.profileId !== RACE_PROFILE_ID) throw new Error('This session requires a different compiled simulation profile.');
    if (scope.participants.length < 2 || scope.participants.length > MAX_RACERS) throw new Error('Races require 2–8 participants.');
    if (!scope.networkId || !scope.raceId || !scope.activeScope || !['neon_tokyo', 'harbor', 'sakura'].includes(scope.track?.kind) || !Number.isSafeInteger(scope.epoch) || scope.epoch < 0) throw new Error('Missing exact race scope.');
    this.#config = { ...scope, activeScope: certificateScope(scope.activeScope), participants: scope.participants.map((participant) => ({ ...participant })) };
    const keys = new Set<string>(), accounts = new Set<string>();
    this.roster = Object.freeze(scope.participants.map((participant, index) => {
      if (participant.slot !== index || !participant.account || !HEX32.test(participant.inputKeyHex) || keys.has(participant.inputKeyHex) || accounts.has(participant.account)) throw new Error('Roster requires unique accounts and keys in canonical slot order.');
      keys.add(participant.inputKeyHex); accounts.add(participant.account);
      return Object.freeze({ ...participant });
    }));
    if (!(slot === -1 && privateKey === null) && (!Number.isInteger(slot) || !this.roster[slot] || !privateKey || hex(ed25519.getPublicKey(privateKey)) !== this.roster[slot].inputKeyHex)) throw new Error('Input key does not belong to this finalized race slot.');
    this.#activeSlots = initial ? [...initial.activeSlots] : this.roster.map(p => p.slot);
    if (this.#activeSlots.length !== this.roster.length) throw new Error('Off-chain checkpoints require every original participant signature; recover unavailable signers through native forced phases.');
    if (slot !== -1 && !this.#activeSlots.includes(slot) || this.#activeSlots.some((s, i) => !this.roster[s] || i > 0 && this.#activeSlots[i - 1]! >= s)) throw new Error('Only consensus-active slots sign a resumed session.');
    if (initial && (initial.replay.track.kind !== scope.track.kind || initial.replay.player_count !== this.roster.length || initial.replay.frames.length % BATCH_TICKS !== 0)) throw new Error('Invalid resume frontier.');
    this.#initialTick = initial?.replay.frames.length ?? 0;
    this.#roundNumber = this.#initialTick / BATCH_TICKS;
    this.#dnfEvents = structuredClone(initial?.replay.dnf_events ?? []);
    this.slot = slot;
    this.#key = privateKey?.slice() ?? new Uint8Array();
    this.scope = digest([DOMAIN, scope.networkId, scope.raceId, scope.profileId, scope.activeScope, scope.track.kind, scope.epoch, this.roster.map((p) => [p.slot, p.account, p.inputKeyHex])]);
    this.#previous = digest([DOMAIN, 'genesis', this.scope]);
    this.transcript = this.roster.map(p => initial?.replay.frames.map(frame => frame.controls[p.slot]!) ?? []);
    this.#preparedTranscript = prepareRaceTranscript(this.#config, raceGameTranscriptV1(this.#replay()), this.certifiedTick, this.roster.length);
    this.#transcriptRoot = this.#preparedTranscript.checkpointRoot(this.certifiedTick);
    if (initial?.checkpoint) {
      const cp = initial.checkpoint.checkpoint;
      if (cp.session_id !== scope.raceId || String(cp.epoch) !== String(scope.epoch) || cp.tick !== this.#initialTick || cp.scope.manifest !== scope.activeScope.manifest || cp.scope.admission !== scope.activeScope.admission || cp.transcript_root !== this.#transcriptRoot || initial.checkpoint.signatures.length !== this.roster.length) throw new Error('Snapshot certificate does not bind the resumed session.');
      const bytes = checkpointSigningFrame(scope.networkId, cp);
      initial.checkpoint.signatures.forEach((signature, index) => {
        if (signature.slot !== index || !/^[0-9A-F]{128}$/.test(signature.signature) || !ed25519.verify(unhex(signature.signature.toLowerCase()), bytes, unhex(this.roster[index]!.inputKeyHex), { zip215: false })) throw new Error('Snapshot certificate requires every original participant signature.');
      });
      this.#anchorCertificate = structuredClone(initial.checkpoint); this.#anchorRoot = cp.state_root;
      this.#previous = checkpointId(scope.networkId, cp);
    }
  }
  get round(): number { return this.#roundNumber; }
  get certifiedTick(): number { return this.#roundNumber * BATCH_TICKS; }
  get previousRoot(): string { return this.#previous; }

  /** Sign the exact starting/resume state before any input may be disclosed. */
  anchor(stateRoot: string): void {
    if (this.#anchorRoot || this.#closed) throw new Error('Session anchor already signed or session closed.');
    this.#anchorRoot = stateRoot;
    if (this.slot !== -1) this.#emit('anchor', [this.#transcriptRoot, stateRoot, false]);
  }
  get anchorCheckpoint(): SignedGameCheckpointV1 | null { return this.#anchorCertificate ? structuredClone(this.#anchorCertificate) : null; }

  commit(controls: readonly number[]): void {
    if (this.slot === -1) throw new Error('Spectators cannot commit or sign gameplay inputs.');
    if (this.#closed || this.#round.failed) throw new Error('Peer session is closed or disputed.');
    if (!this.#anchorCertificate) throw new Error('Every active racer must certify the initial state before input commitment.');
    if (this.certifiedTick >= MAX_RACE_TICKS) throw new Error('Race tick limit reached.');
    if (controls.length !== BATCH_TICKS || controls.some((control) => !Number.isInteger(control) || control < 0 || control > 63)) throw new Error('Each batch contains exactly six canonical six-bit control words.');
    if (this.#round.localSecret) throw new Error('Already committed this round.');
    const salt = formatGameNonceLiteralV1(crypto.getRandomValues(new Uint8Array(32)));
    this.#round.localSecret = { controls: [...controls], salt };
    this.#emit('commit', [this.#commitHash(this.slot, controls, salt)]);
  }

  checkpoint(stateRoot: string, terminal = false): void {
    if (this.#closed || !this.#round.delivered || !this.#round.inputsRoot || this.#round.failed) throw new Error('Only fully revealed authenticated inputs can be checkpointed.');
    gameCommitment(stateRoot);
    if (this.#round.checkpoints.has(this.slot)) throw new Error('Already signed this checkpoint.');
    this.#round.expectedStateRoot = stateRoot;
    this.#round.expectedTerminal = terminal;
    if (this.slot !== -1) this.#emit('checkpoint', [this.#round.inputsRoot, stateRoot, terminal]);
    else this.#progress();
  }

  #commitHash(slot: number, controls: readonly number[], salt: string): string {
    return inputDigest(this.#config.networkId, this.#revealValue(slot, controls, salt));
  }
  #revealValue(slot: number, controls: readonly number[], salt: string) { return { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, start_tick: this.certifiedTick, slot, payload: raceInputPayloadV1([...controls]), nonce: salt }; }
  #replay(): RaceReplayV1 {
    const count = this.transcript[0]?.length ?? 0;
    const frames = Array.from({ length: count }, (_, tick) => ({ tick, controls: this.transcript.map((controls) => controls[tick]!) }));
    return { track: this.#config.track, player_count: this.roster.length, frames, dnf_events: structuredClone(this.#dnfEvents) };
  }
  #frontierBody() { return { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, start_tick: this.certifiedTick, parent_transcript_root: this.#transcriptRoot, commitments: this.roster.map(p => this.#round.commits.get(p.slot)?.body[0] as string ?? (() => { throw new Error('A frontier requires all original input commitments.'); })()) }; }
  #checkpointBody(body: readonly unknown[]): GameCheckpointV1 { return { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, tick: this.certifiedTick + BATCH_TICKS, transcript_root: body[0] as string, state_root: body[1] as string, terminal: body[2] as boolean }; }
  #signingBytes(message: Omit<PeerMessage, 'signature'> | PeerMessage): Uint8Array {
    const base = { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, start_tick: message.round * BATCH_TICKS };
    if (message.kind === 'anchor') return checkpointSigningFrame(this.#config.networkId, { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, tick: message.round * BATCH_TICKS, transcript_root: message.body[0] as string, state_root: message.body[1] as string, terminal: false });
    if (message.kind === 'commit') return inputSigningFrame(this.#config.networkId, { ...base, slot: message.slot, commitment: message.body[0] as string });
    if (message.kind === 'reveal') return revealSigningFrame(this.#config.networkId, { ...base, slot: message.slot, payload: raceInputPayloadV1(message.body[0] as number[]), nonce: message.body[1] as string });
    if (message.kind === 'frontier') return frontierSigningFrame(this.#config.networkId, message.body[0] as Omit<GameCommitmentSetV1, 'signatures'>);
    return checkpointSigningFrame(this.#config.networkId, { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, tick: (message.round + 1) * BATCH_TICKS, transcript_root: message.body[0] as string, state_root: message.body[1] as string, terminal: message.body[2] as boolean });
  }

  #emit(kind: MessageKind, body: readonly unknown[]): void {
    const unsigned = { v: 1 as const, scope: this.scope, slot: this.slot, round: this.#roundNumber, previous: this.#previous, kind, body };
    const message: PeerMessage = { ...unsigned, signature: hex(ed25519.sign(this.#signingBytes(unsigned), this.#key)) };
    this.receive(message);
    this.send(message);
  }

  /** Native signatures bind canonical payloads, not JSON object insertion order.
   * Routing fields are compared separately: equality here never authenticates
   * the peer envelope, and future previous roots are still checked on delivery.
   * Both arguments have already passed this session's signature validation.
   */
  #samePacket(left: PeerMessage, right: PeerMessage): boolean {
    return left.v === right.v && left.scope === right.scope && left.slot === right.slot
      && left.round === right.round && left.previous === right.previous && left.kind === right.kind
      && hex(this.#signingBytes(left)) === hex(this.#signingBytes(right));
  }

  /** Invalid packets throw and are not retained; duplicates are harmless, equivocation produces evidence. */
  receive(value: unknown): void {
    if (this.#closed) throw new Error('Peer session is closed.');
    const message = this.#validate(value);
    if (message.kind === 'anchor') {
      if (message.round * BATCH_TICKS !== this.#initialTick || message.previous !== digest([DOMAIN, 'genesis', this.scope])) throw new Error('Anchor does not match the initial frontier.');
      const old = this.#anchors.get(message.slot);
      if (old && !this.#samePacket(old, message)) { this.#dispute('A racer signed conflicting initial states.', [old, message]); return; }
      this.#anchors.set(message.slot, message);
      if (this.#anchorRoot && this.#anchors.size === this.#activeSlots.length && !this.#anchorCertificate) {
        const packets = this.#ordered(this.#anchors);
        if (packets.some(p => p.body[0] !== this.#transcriptRoot || p.body[1] !== this.#anchorRoot)) { this.#dispute('Initial simulation states disagree.', packets); return; }
        this.#anchorCertificate = { checkpoint: { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, tick: this.#initialTick, transcript_root: this.#transcriptRoot, state_root: this.#anchorRoot, terminal: false }, signatures: packets.map(p => ({ slot: p.slot, signature: p.signature.toUpperCase() })) };
        this.onEvent({ type: 'anchored', checkpoint: structuredClone(this.#anchorCertificate) });
      }
      return;
    }
    if (message.round < this.#roundNumber) return;
    if (message.round === this.#roundNumber + 1) {
      if (this.#future.some(stored => this.#samePacket(stored, message))) return;
      if (this.#future.length >= this.roster.length * 4) throw new Error('Future input queue is full.');
      this.#future.push(message);
      return;
    }
    if (message.round !== this.#roundNumber || message.previous !== this.#previous) throw new Error('Message does not extend the certified frontier.');
    const map = message.kind === 'commit' ? this.#round.commits : message.kind === 'frontier' ? this.#round.frontiers : message.kind === 'reveal' ? this.#round.reveals : this.#round.checkpoints;
    const previous = map.get(message.slot);
    if (previous) {
      if (!this.#samePacket(previous, message)) this.#dispute('A racer signed conflicting messages.', [previous, message]);
      return;
    }
    map.set(message.slot, message);
    this.#progress();
  }

  #validate(value: unknown): PeerMessage {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid peer packet.');
    const msg = value as Record<string, unknown>;
    const names = ['v', 'scope', 'slot', 'round', 'previous', 'kind', 'body', 'signature'];
    if (Object.keys(msg).length !== names.length || names.some((name) => !Object.prototype.hasOwnProperty.call(msg, name))) throw new Error('Unexpected peer packet fields.');
    if (msg.v !== 1 || msg.scope !== this.scope || !Number.isInteger(msg.slot) || !this.#activeSlots.includes(msg.slot as number) || !Number.isInteger(msg.round) || (msg.round as number) < 0 || (msg.round as number) >= MAX_RACE_TICKS / BATCH_TICKS || typeof msg.previous !== 'string' || !(HEX32.test(msg.previous) || /^game384:[0-9A-F]{96}$/.test(msg.previous)) || typeof msg.signature !== 'string' || !HEX64.test(msg.signature)) throw new Error('Invalid race scope, sender or round.');
    if (!Array.isArray(msg.body) || !['anchor', 'commit', 'frontier', 'reveal', 'checkpoint'].includes(String(msg.kind))) throw new Error('Unknown peer message kind.');
    const body: unknown[] = msg.body;
    if (msg.kind === 'reveal') {
      if (body.length !== 2 || !Array.isArray(body[0]) || body[0].length !== BATCH_TICKS || body[0].some((control: unknown) => !Number.isInteger(control) || (control as number) < 0 || (control as number) > 63) || typeof body[1] !== 'string') throw new Error('Invalid input reveal.');
    } else if (msg.kind === 'frontier') {
      if (body.length !== 1 || !body[0] || typeof body[0] !== 'object') throw new Error('Invalid commitment frontier.');
      const native = body[0] as Record<string, unknown>;
      if (native.session_id !== this.#config.raceId || !native.scope || JSON.stringify(certificateScope(native.scope as GameActiveScopeV1)) !== JSON.stringify(this.#config.activeScope) || String(native.epoch) !== String(this.#config.epoch) || native.start_tick !== (msg.round as number) * BATCH_TICKS || !Array.isArray(native.commitments) || native.commitments.length !== this.roster.length) throw new Error('Frontier changed the race, epoch, tick or roster.');
    } else if (msg.kind === 'checkpoint' || msg.kind === 'anchor') {
      if (body.length !== 3 || typeof body[0] !== 'string' || typeof body[1] !== 'string' || typeof body[2] !== 'boolean') throw new Error('Invalid checkpoint.');
      // Anchor signatures bind terminal=false. Reject a different envelope
      // value before retaining it as purported signed equivocation evidence.
      if (msg.kind === 'anchor' && body[2] !== false) throw new Error('Session anchors must be nonterminal.');
    } else {
      if (body.length !== 1 || typeof body[0] !== 'string') throw new Error('Invalid commitment.');
    }
    const packet = structuredClone(value) as PeerMessage;
    if (!ed25519.verify(unhex(packet.signature), this.#signingBytes(packet), unhex(this.roster[packet.slot]!.inputKeyHex), { zip215: false })) throw new Error('Peer message signature is invalid.');
    return packet;
  }

  #ordered(map: Map<number, PeerMessage>): PeerMessage[] { return this.#activeSlots.map((slot) => map.get(slot)!); }
  #progress(): void {
    const round = this.#round, count = this.#activeSlots.length;
    if (round.failed) return;
    if (round.commits.size === count && !round.commitmentsRoot) {
      round.commitmentsRoot = frontierId(this.#config.networkId, this.#frontierBody());
      if (this.slot !== -1) this.#emit('frontier', [this.#frontierBody()]);
    }
    if (round.frontiers.size === count && round.commitmentsRoot) {
      if (!round.frontierAgreementChecked) {
        if (this.#ordered(round.frontiers).some((m) => frontierId(this.#config.networkId, m.body[0] as Omit<GameCommitmentSetV1, 'signatures'>) !== round.commitmentsRoot)) return this.#dispute('Racers signed different commitment frontiers.', this.#ordered(round.frontiers));
        // Retained packets are private structured clones. Once all slots are
        // present, duplicates never replace them and conflicts still dispute.
        // Set before emitting the local reveal, which can re-enter progress.
        round.frontierAgreementChecked = true;
      }
      if (round.localSecret && !round.reveals.has(this.slot)) this.#emit('reveal', [round.localSecret.controls, round.localSecret.salt]);
      if (round.reveals.size === count && !round.delivered) {
        const reveals = this.#ordered(round.reveals);
        for (const reveal of reveals) if (this.#commitHash(reveal.slot, reveal.body[0] as number[], reveal.body[1] as string) !== round.commits.get(reveal.slot)!.body[0]) return this.#dispute('Revealed input does not match its signed commitment.', [round.commits.get(reveal.slot)!, reveal]);
        const controls = this.roster.map(p => round.reveals.get(p.slot)?.body[0] as number[] ?? Array<number>(BATCH_TICKS).fill(0));
        // Preview only this round's complete inputs. The immutable certified owner
        // remains usable for dispute recovery until every checkpoint signature agrees.
        round.preparedTranscript = extendGameTranscriptV1(this.#preparedTranscript, this.certifiedTick + BATCH_TICKS, {
          batches: [{ start_tick: this.certifiedTick, inputs: controls.map(row => Uint8Array.from(raceInputPayloadV1(row))) }],
          dnf_events: [],
        });
        round.inputsRoot = round.preparedTranscript.checkpointRoot(this.certifiedTick + BATCH_TICKS);
        round.delivered = true;
        this.onEvent({ type: 'inputs', round: this.#roundNumber, controls: controls.map(row => Object.freeze([...row])), inputsRoot: round.inputsRoot });
      }
    }
    if (round.checkpoints.size === count && round.delivered && round.expectedStateRoot && round.expectedTerminal !== undefined && this.#round === round) {
      const signatures = this.#ordered(round.checkpoints), first = signatures[0]!;
      // Spectators do not add a signature of their own. Even unanimous racer
      // signatures must match the observer's computed terminal condition.
      if (signatures.some((m) => m.body[0] !== round.inputsRoot || m.body[1] !== round.expectedStateRoot || m.body[2] !== round.expectedTerminal)) return this.#dispute('Simulation checkpoint roots or terminal condition disagree.', signatures);
      const native = { checkpoint: this.#checkpointBody(first.body), signatures: signatures.map((message) => ({ slot: message.slot, signature: message.signature.toUpperCase() })) };
      const checkpoint: CertifiedCheckpoint = Object.freeze({ round: this.#roundNumber, tick: (this.#roundNumber + 1) * BATCH_TICKS, previous: this.#previous, commitmentsRoot: round.commitmentsRoot!, inputsRoot: round.inputsRoot!, stateRoot: first.body[1] as string, root: checkpointId(this.#config.networkId, native.checkpoint), signatures: Object.freeze(signatures), native });
      this.roster.forEach(p => this.transcript[p.slot]!.push(...(round.reveals.get(p.slot)?.body[0] as number[] ?? Array<number>(BATCH_TICKS).fill(0))));
      this.#certifiedReveals.push(...this.nativeRevealedInputs);
      this.checkpoints.push(checkpoint);
      this.#previous = checkpoint.root;
      this.#preparedTranscript = round.preparedTranscript!;
      this.#transcriptRoot = this.#preparedTranscript.checkpointRoot(this.certifiedTick + BATCH_TICKS);
      this.#roundNumber++;
      this.#round = makeRound();
      this.onEvent({ type: 'certified', checkpoint });
      const pending = this.#future; this.#future = [];
      for (const packet of pending) this.receive(packet);
    }
  }
  #dispute(reason: string, evidence: readonly PeerMessage[]): void {
    if (this.#round.failed) return;
    this.#round.failed = true;
    this.onEvent({ type: 'rollback', tick: this.certifiedTick, reason, evidence });
  }
  /** Public transcript export contains no unrevealed controls or secret signing keys. */
  exportReplay(): { scope: string; roster: readonly RaceParticipant[]; controls: number[][]; checkpoints: CertifiedCheckpoint[] } {
    return structuredClone({ scope: this.scope, roster: this.roster, controls: this.transcript, checkpoints: this.checkpoints });
  }
  exportNativeReplay(): RaceReplayV1 { return this.#replay(); }
  get pendingFrontier(): GameCommitmentSetV1 | null {
    if (this.#round.frontiers.size !== this.#activeSlots.length || !this.#round.commitmentsRoot) return null;
    const packets = this.#ordered(this.#round.frontiers);
    // A complete set of signatures can cover different bodies. Export only a
    // shared certificate, including after a later reveal/checkpoint dispute.
    if (packets.some(message => frontierId(this.#config.networkId, message.body[0] as Omit<GameCommitmentSetV1, 'signatures'>) !== this.#round.commitmentsRoot)) return null;
    return { ...this.#frontierBody(), signatures: packets.map(message => ({ slot: message.slot, signature: message.signature.toUpperCase() })) };
  }
  get nativeInputCommitments(): GameInputCommitmentV1[] {
    return this.#ordered(this.#round.commits).filter(Boolean).map(packet => ({ session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, start_tick: this.certifiedTick, slot: packet.slot, commitment: packet.body[0] as string, signature: packet.signature.toUpperCase() }));
  }
  /** Already public reveals retained across rounds so older ledger frontiers can be opened. */
  get retainedRevealedInputs(): GameInputRevealV1[] {
    return structuredClone([...this.#certifiedReveals, ...this.nativeRevealedInputs]);
  }
  get nativeRevealedInputs(): GameInputRevealV1[] {
    return this.#ordered(this.#round.reveals).filter(Boolean).map(packet => this.#revealValue(packet.slot, packet.body[0] as number[], packet.body[1] as string));
  }
  get nativeInputCommitment(): GameInputCommitmentV1 | null {
    const packet = this.#round.commits.get(this.slot);
    return packet ? { session_id: this.#config.raceId, scope: this.#config.activeScope, epoch: this.#config.epoch, start_tick: this.certifiedTick, slot: this.slot, commitment: packet.body[0] as string, signature: packet.signature.toUpperCase() } : null;
  }
  get nativeRevealedInput(): GameInputRevealV1 | null {
    const secret = this.#round.localSecret;
    return secret && this.#round.reveals.has(this.slot) ? this.#revealValue(this.slot, secret.controls, secret.salt) : null;
  }
  close(): void { this.#key.fill(0); this.#closed = true; this.#round.localSecret = undefined; }
}
