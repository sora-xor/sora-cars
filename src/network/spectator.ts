import { ed25519 } from '@noble/curves/ed25519';
import { checkpointSigningFrame } from '../chain/certificates';
import type { RaceReplayV1 } from '@iroha/iroha-js/race';
import type { SignedGameCheckpointV1 } from '@iroha/iroha-js/game';
import { RacePeerSession, unhex } from './session';
import type { RaceScope, PeerMessage, ProtocolEvent } from './session';
import { simulateNativeReplay } from './controller';
import { stateRoot, checkpointTranscriptRoot } from '../chain/races';
import { copyRace, createRace, stepRaceBatch, raceFinished } from '../game/engine';
import { gameTrack } from '../chain/races';
import type { RaceState } from '../game/engine';
import { emptyAppearance, type ClubAppearance } from '../game/catalog';
import type { CarBuild } from '../game/car-builds';
import { verifyAppearance, verifyBuild } from './appearance';

/** Read-only feed verification; no wallet or participant input key is required. */
export class RaceSpectator {
  onState: (state: RaceState) => void = () => {};
  onStatus: (reason: string) => void = () => {};
  onSnapshotRequired: () => void = () => {};
  onCheckpoint: (checkpoint: SignedGameCheckpointV1) => void = () => {};
  #session: RacePeerSession;
  #scope: RaceScope;
  #state: RaceState;
  #candidate: RaceState | null = null;
  #socket: WebSocket | null = null;
  #failed = false;
  #activeSlots: readonly number[];
  #appearances: ClubAppearance[];
  #appearanceSignatures = new Map<number, string>();
  /** Each racer's announced car (car-builds.ts); null until their packet arrives. */
  #builds: (CarBuild | null)[];
  #buildSignatures = new Map<number, string>();
  constructor(scope: RaceScope, resume?: { replay: RaceReplayV1; checkpoint: SignedGameCheckpointV1; activeSlots: readonly number[] }) {
    this.#scope = structuredClone(scope);
    this.#appearances = scope.participants.map(() => emptyAppearance());
    this.#builds = scope.participants.map(() => null);
    this.#activeSlots = resume?.activeSlots ?? scope.participants.map(p => p.slot);
    this.#state = resume ? simulateNativeReplay(resume.replay) : createRace(gameTrack(scope.track), scope.participants.length);
    if (resume) this.#verifySnapshot(resume.replay, resume.checkpoint);
    this.#session = new RacePeerSession(scope, -1, null, resume);
    this.#session.onEvent = event => this.#event(event);
    if (!resume) this.#session.anchor(stateRoot(scope, this.#state));
  }
  #verifySnapshot(replay: RaceReplayV1, signed: SignedGameCheckpointV1): void {
    const cp = signed.checkpoint, scope = this.#scope;
    if (cp.session_id !== scope.raceId || String(cp.epoch) !== String(scope.epoch) || cp.scope.manifest !== scope.activeScope.manifest || cp.scope.admission !== scope.activeScope.admission || cp.tick !== replay.frames.length || cp.transcript_root !== checkpointTranscriptRoot(scope, replay) || cp.state_root !== stateRoot(scope, this.#state) || cp.terminal !== raceFinished(this.#state) || signed.signatures.length !== this.#activeSlots.length) throw new Error('Spectator snapshot does not match the authenticated game scope or deterministic replay.');
    const bytes = checkpointSigningFrame(scope.networkId, cp);
    signed.signatures.forEach((signature, index) => {
      if (signature.slot !== this.#activeSlots[index] || !/^[0-9A-F]{128}$/.test(signature.signature) || !ed25519.verify(unhex(signature.signature.toLowerCase()), bytes, unhex(scope.participants[signature.slot]!.inputKeyHex), { zip215: false })) throw new Error('Spectator checkpoint lacks a valid signature from every active racer.');
    });
  }
  #event(event: ProtocolEvent): void {
    if (this.#failed) return;
    if (event.type === 'anchored') this.onStatus('Initial state independently verified against every active racer signature.');
    else if (event.type === 'inputs') {
      this.#candidate = copyRace(this.#state);
      stepRaceBatch(this.#candidate, Array.from({ length: 6 }, (_, tick) => event.controls.map(row => row[tick]!)));
      this.#session.checkpoint(stateRoot(this.#scope, this.#candidate), raceFinished(this.#candidate));
    } else if (event.type === 'certified') {
      if (!this.#candidate || this.#candidate.tick !== event.checkpoint.tick || stateRoot(this.#scope, this.#candidate) !== event.checkpoint.stateRoot) throw new Error('Spectator simulation differs from the certificate.');
      this.#state = this.#candidate; this.#candidate = null;
      this.onState(this.state); this.onCheckpoint(event.checkpoint.native);
    } else if (event.type === 'rollback') { this.#failed = true; this.#candidate = null; this.onStatus(`Feed cannot advance: ${event.reason}`); }
    else this.onStatus(event.reason);
  }
  get state(): RaceState { return copyRace(this.#state); }
  get appearances(): ClubAppearance[] { return this.#appearances.map(a => ({ ...a })); }
  get builds(): (CarBuild | null)[] { return this.#builds.map(build => build && { ...build }); }
  receive(packet: unknown): void {
    if (packet && typeof packet === 'object' && (packet as { kind?: unknown }).kind === 'appearance') {
      const p = verifyAppearance(packet, this.#session.scope, this.#scope.participants), prior = this.#appearanceSignatures.get(p.slot);
      if (prior && prior !== p.signature) throw new Error('Spectator cosmetic choice changed during this session.');
      this.#appearanceSignatures.set(p.slot, p.signature); this.#appearances[p.slot] = p.appearance; return;
    }
    if (packet && typeof packet === 'object' && (packet as { kind?: unknown }).kind === 'build') {
      const p = verifyBuild(packet, this.#session.scope, this.#scope.participants), prior = this.#buildSignatures.get(p.slot);
      if (prior && prior !== p.signature) throw new Error('Spectator car build changed during this session.');
      this.#buildSignatures.set(p.slot, p.signature); this.#builds[p.slot] = p.build; return;
    }
    if (this.#failed) throw new Error('Disputed spectator feed requires an authenticated native recovery frontier.');
    this.#session.receive(packet);
  }
  /** The optional relay is a transport. Its packets cannot move the verified spectator state by themselves. */
  connect(url: string): Promise<void> {
    const endpoint = new URL(url);
    if (endpoint.username || endpoint.password || endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) throw new Error('Spectator feeds require WSS outside localhost.');
    this.#socket?.close(); const socket = new WebSocket(endpoint); this.#socket = socket;
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', () => { socket.send(JSON.stringify({ type: 'watch', scope: this.#session.scope })); resolve(); }, { once: true });
      socket.addEventListener('error', () => reject(new Error('Spectator feed is unavailable.')), { once: true });
      socket.addEventListener('message', event => {
        try {
          if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).byteLength > 32 * 1024) throw new Error('Oversized spectator packet.');
          const packet = JSON.parse(event.data);
          if (packet?.type === 'snapshot_required') { this.onStatus('This live feed needs a signed checkpoint and its matching replay to join in progress.'); this.onSnapshotRequired(); return; }
          this.receive(packet as PeerMessage);
        } catch (error) { this.onStatus(`Rejected feed packet: ${error instanceof Error ? error.message : String(error)}`); }
      });
    });
  }
  exportNativeReplay(): RaceReplayV1 { return this.#session.exportNativeReplay(); }
  close(): void { this.#socket?.close(); this.#session.close(); }
}
