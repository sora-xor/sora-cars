import { ed25519 } from '@noble/curves/ed25519';
import { hex, unhex, MAX_RACERS } from './session';
import type { PeerMessage, RaceParticipant } from './session';
import type { ReplayChunk } from './replay';
import { iceConfiguration } from './ice';
import { signAppearance, signBuild, verifyAppearance, verifyBuild, type AppearancePacket, type BuildPacket } from './appearance';
import { emptyAppearance, type ClubAppearance } from '../game/catalog';
import type { CarBuild } from '../game/car-builds';

const MAX_PACKET_BYTES = 32 * 1024;
interface Signal {
  v: 1; scope: string; from: number; to: number;
  description: RTCSessionDescriptionInit; signature: string;
}
const signalBytes = (signal: Omit<Signal, 'signature'>): Uint8Array => new TextEncoder().encode(JSON.stringify(['sora-cars/signal/v1', signal.v, signal.scope, signal.from, signal.to, signal.description.type, signal.description.sdp]));
export interface MeshConfig {
  scope: string; slot: number; roster: readonly RaceParticipant[]; privateKey: Uint8Array;
  /** No public STUN/TURN service is assumed. Supply replaceable ICE servers explicitly. */
  iceServers?: RTCIceServer[];
  relayOnly?: boolean;
  /** Explicitly opt a public session into the replaceable spectator feed. */
  publicFeed?: boolean;
  appearance?: ClubAppearance;
  /** This racer's car as built (car-builds.ts); none draws the factory car on every screen. */
  build?: CarBuild;
}
export type MeshEvent = { type: 'peer'; slot: number; status: RTCPeerConnectionState } | { type: 'signal'; packet: string } | { type: 'error'; reason: string };

/** Untrusted signaling + authenticated game packets. No host elects an authoritative simulation. */
export class RaceMesh {
  onMessage: (packet: PeerMessage) => void = () => {};
  onReplayChunk: (slot: number, chunk: unknown) => void = () => {};
  onAppearance: (slot: number, appearance: ClubAppearance) => void = () => {};
  onBuild: (slot: number, build: CarBuild) => void = () => {};
  onEvent: (event: MeshEvent) => void = () => {};
  #config: MeshConfig;
  #peers = new Map<number, RTCPeerConnection>();
  #channels = new Map<number, RTCDataChannel>();
  #socket: WebSocket | null = null;
  #key: Uint8Array;
  #appearance: AppearancePacket;
  #seenAppearances = new Map<number, string>();
  #build: BuildPacket | null;
  #seenBuilds = new Map<number, string>();
  constructor(config: MeshConfig) {
    if (config.roster.length < 2 || config.roster.length > MAX_RACERS || config.roster[config.slot]?.inputKeyHex !== hex(ed25519.getPublicKey(config.privateKey))) throw new Error('Mesh identity must match the authenticated race roster.');
    this.#config = { ...config, roster: config.roster.map((p) => ({ ...p })), privateKey: new Uint8Array() };
    this.#key = config.privateKey.slice();
    this.#appearance = signAppearance(config.scope, config.slot, config.appearance ?? emptyAppearance(), config.privateKey);
    this.#build = config.build ? signBuild(config.scope, config.slot, config.build, config.privateKey) : null;
  }

  #peer(slot: number): RTCPeerConnection {
    if (!Number.isInteger(slot) || !this.#config.roster[slot] || slot === this.#config.slot) throw new Error('Peer slot is outside the race roster.');
    const current = this.#peers.get(slot);
    if (current) return current;
    const peer = new RTCPeerConnection(iceConfiguration(this.#config.iceServers ?? [], this.#config.relayOnly ?? false));
    peer.addEventListener('connectionstatechange', () => this.onEvent({ type: 'peer', slot, status: peer.connectionState }));
    peer.addEventListener('datachannel', (event) => this.#attach(slot, event.channel));
    this.#peers.set(slot, peer);
    return peer;
  }
  #attach(slot: number, channel: RTCDataChannel): void {
    if (channel.label !== 'sora-cars-v1' || this.#channels.has(slot)) { channel.close(); return; }
    this.#channels.set(slot, channel);
    channel.addEventListener('open', () => {
      channel.send(JSON.stringify(this.#appearance));
      if (this.#build) channel.send(JSON.stringify(this.#build));
    }, { once: true });
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      try {
        if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).byteLength > MAX_PACKET_BYTES) throw new Error('Oversized or non-text peer message.');
        const raw: unknown = JSON.parse(event.data);
        if (raw && typeof raw === 'object' && (raw as { kind?: string }).kind === 'appearance') {
          const packet = verifyAppearance(raw, this.#config.scope, this.#config.roster);
          if (packet.slot !== slot) throw new Error('Cosmetic sender differs from its transport slot.');
          const prior = this.#seenAppearances.get(slot);
          if (prior && prior !== packet.signature) throw new Error('Cosmetic choice changed during the session.');
          this.#seenAppearances.set(slot, packet.signature); this.onAppearance(slot, packet.appearance); return;
        }
        if (raw && typeof raw === 'object' && (raw as { kind?: string }).kind === 'build') {
          const packet = verifyBuild(raw, this.#config.scope, this.#config.roster);
          if (packet.slot !== slot) throw new Error('Car build sender differs from its transport slot.');
          const prior = this.#seenBuilds.get(slot);
          if (prior && prior !== packet.signature) throw new Error('Car build changed during the session.');
          this.#seenBuilds.set(slot, packet.signature); this.onBuild(slot, packet.build); return;
        }
        if (raw && typeof raw === 'object' && (raw as { kind?: string }).kind === 'replay-chunk') { this.onReplayChunk(slot, raw); return; }
        const message = raw as PeerMessage;
        if (message.slot !== slot) throw new Error('Peer transport sender differs from the signed slot.');
        this.onMessage(message);
      } catch (error) { this.onEvent({ type: 'error', reason: error instanceof Error ? error.message : String(error) }); }
    });
    channel.addEventListener('close', () => { if (this.#channels.get(slot) === channel) this.#channels.delete(slot); });
  }
  #sign(to: number, description: RTCSessionDescriptionInit): Signal {
    const unsigned = { v: 1 as const, scope: this.#config.scope, from: this.#config.slot, to, description: { type: description.type, sdp: description.sdp } };
    return { ...unsigned, signature: hex(ed25519.sign(signalBytes(unsigned), this.#key)) };
  }
  async #gather(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const finished = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', changed); resolve(); };
      const changed = () => { if (peer.iceGatheringState === 'complete') finished(); };
      const timer = setTimeout(finished, 5000);
      peer.addEventListener('icegatheringstatechange', changed);
    });
  }
  #publish(signal: Signal): string {
    const packet = JSON.stringify(signal);
    if (new TextEncoder().encode(packet).length > MAX_PACKET_BYTES) throw new Error('ICE description exceeds the signaling size limit.');
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(packet);
    this.onEvent({ type: 'signal', packet });
    return packet;
  }
  /** Copy this signed offer to the peer; no signaling server is required. Lower slot initiates. */
  async offer(slot: number): Promise<string> {
    if (this.#config.slot >= slot) throw new Error('The lower numbered slot creates an offer to prevent negotiation conflicts.');
    const peer = this.#peer(slot);
    if (peer.signalingState !== 'stable') throw new Error('A peer offer is already in progress.');
    this.#attach(slot, peer.createDataChannel('sora-cars-v1', { ordered: true }));
    await peer.setLocalDescription(await peer.createOffer());
    await this.#gather(peer);
    return this.#publish(this.#sign(slot, peer.localDescription!));
  }
  /** Paste a signed offer/answer, or receive it from any replaceable relay. */
  async accept(packet: string): Promise<string | null> {
    if (new TextEncoder().encode(packet).length > MAX_PACKET_BYTES) throw new Error('Oversized signaling packet.');
    const signal = JSON.parse(packet) as Signal;
    if (!signal || Object.keys(signal).sort().join(',') !== 'description,from,scope,signature,to,v' || signal.v !== 1 || signal.scope !== this.#config.scope || signal.to !== this.#config.slot || !Number.isInteger(signal.from) || !this.#config.roster[signal.from] || typeof signal.signature !== 'string' || !/^[0-9a-f]{128}$/.test(signal.signature) || !signal.description || Object.keys(signal.description).sort().join(',') !== 'sdp,type' || !['offer', 'answer'].includes(signal.description.type) || typeof signal.description.sdp !== 'string') throw new Error('Invalid signaling envelope.');
    if (!ed25519.verify(unhex(signal.signature), signalBytes(signal), unhex(this.#config.roster[signal.from]!.inputKeyHex), { zip215: false })) throw new Error('Signaling identity signature failed.');
    const peer = this.#peer(signal.from);
    if (signal.description.type === 'offer') {
      if (signal.from >= this.#config.slot || peer.signalingState !== 'stable') throw new Error('Unexpected negotiation offer.');
      await peer.setRemoteDescription(signal.description);
      await peer.setLocalDescription(await peer.createAnswer());
      await this.#gather(peer);
      return this.#publish(this.#sign(signal.from, peer.localDescription!));
    }
    if (signal.from <= this.#config.slot || peer.signalingState !== 'have-local-offer') throw new Error('Unexpected negotiation answer.');
    await peer.setRemoteDescription(signal.description);
    return null;
  }

  /** Optional convenience relay; it never supplies keys or decides the roster. */
  connectSignaling(url: string): Promise<void> {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) throw new Error('Signaling requires WSS outside localhost.');
    this.#socket?.close();
    const socket = new WebSocket(parsed);
    this.#socket = socket;
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'subscribe', scope: this.#config.scope, slot: this.#config.slot }));
        if (this.#config.publicFeed) for (const packet of [this.#appearance, this.#build]) if (packet) socket.send(JSON.stringify({ type: 'game', scope: this.#config.scope, from: this.#config.slot, packet }));
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => reject(new Error('Signaling relay unavailable. Use manual signed offers.')), { once: true });
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        void this.accept(event.data).catch((error: unknown) => this.onEvent({ type: 'error', reason: error instanceof Error ? error.message : String(error) }));
      });
    });
  }
  broadcast(message: PeerMessage): void {
    const packet = JSON.stringify(message);
    if (new TextEncoder().encode(packet).length > MAX_PACKET_BYTES) throw new Error('Peer packet exceeds the transport limit.');
    if (this.#config.publicFeed && this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify({ type: 'game', scope: this.#config.scope, from: this.#config.slot, packet: message }));
    for (const [slot, channel] of this.#channels) {
      if (channel.readyState !== 'open') continue;
      if (channel.bufferedAmount > 256 * 1024) { this.onEvent({ type: 'error', reason: `Peer ${slot + 1} is too far behind.` }); continue; }
      channel.send(packet);
    }
  }
  async sendReplay(slot: number, chunks: readonly ReplayChunk[]): Promise<void> {
    const channel = this.#channels.get(slot);
    if (!channel || channel.readyState !== 'open' || chunks.length > 64) throw new Error('Replay peer is unavailable or transfer is oversized.');
    for (const chunk of chunks) {
      const packet = JSON.stringify(chunk);
      if (new TextEncoder().encode(packet).length > MAX_PACKET_BYTES) throw new Error('Oversized replay chunk.');
      if (channel.bufferedAmount > 256 * 1024) await new Promise<void>((resolve, reject) => {
        channel.bufferedAmountLowThreshold = 64 * 1024;
        const timer = setTimeout(() => { channel.removeEventListener('bufferedamountlow', ready); reject(new Error('Replay peer stalled.')); }, 5000);
        const ready = () => { clearTimeout(timer); resolve(); };
        channel.addEventListener('bufferedamountlow', ready, { once: true });
      });
      if (channel.readyState !== 'open') throw new Error('Replay peer disconnected.');
      channel.send(packet);
    }
  }
  get connectedSlots(): number[] { return [...this.#channels].filter(([, channel]) => channel.readyState === 'open').map(([slot]) => slot); }
  close(): void { this.#socket?.close(); this.#peers.forEach((peer) => peer.close()); this.#peers.clear(); this.#channels.clear(); this.#key.fill(0); }
}
