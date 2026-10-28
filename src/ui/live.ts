import { encodeGameValueV1, decodeGameValueV1, type SignedGameCheckpointV1, type GameInputCommitmentV1, type GameInputRevealV1 } from '@iroha/iroha-js/game';
import { collectAcceptedHistory } from '../chain/history';
import { activeScope } from '../chain/certificates';
import { equipmentTermsMarkup } from './entry-terms';
import { ed25519 } from '@noble/curves/ed25519';
import { decodeRaceValueV1, encodeRaceValueV1, type RaceReplayV1 } from '@iroha/iroha-js/race';
import type { RaceChainClient } from '../chain/client';
import { garageInventory, type GarageNft } from '../chain/inventory';
import { clubItem, type ClubAppearance } from '../game/catalog';
import { advanceRaceDeadline, assertSameRaceTerms, challengeRace, claimRacePayout, expireRace, forcedRaceInput, gameTrack, inputKeyLiteral, joinRace, newRaceId, newRaceInputKey, openRace, parseRaceList, parseRaceRecord, publishCheckpoint, checkpointOpenings, mergeRaceReveals, mergeRaceCommitments, publishInputCommitment, publishInputReveal, raceInvitation, raceRoster, recoveryInputs, settleRace, checkpointTranscriptRoot, startRace, stakeRaceItem, type RaceRecord } from '../chain/races';
import { parseRaceProofBundle, raceProofSourceMatches, assertRaceProofSourceUnchanged, type RaceProofBundle } from '../chain/proof';
import { collectCertifiedSettlement, assertSettlementWalletBinding, settlementExportOrigin, settlementExportRequest, SETTLEMENT_DESCRIPTOR_FILE, settlementVerificationCommand, settlementVerificationTrust, type SettlementVerificationTrust } from '../chain/finality';
import { selectFinalityDirectory, supportsFinalityDirectoryExport, type SettlementDirectoryExport } from './finality-export';
import { PROOF_BUNDLE_JSON_LIMIT, PUBLIC_REPLAY_JSON_LIMIT, encodePublicReplayJson } from '../chain/proof-limits';
import { MultiplayerRaceController, replayConsensusFrontier, type NativeDisputeEvidence } from '../network/controller';
import { RaceSpectator } from '../network/spectator';
import { parseIceServers, iceConfiguration } from '../network/ice';
import { japaneseInterface, japaneseError } from './language';
import { hex, unhex, type InputKeyPair } from '../network/session';
import { LIVERIES, TRACKS } from '../game/rules';
import type { RaceState } from '../game/engine';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-5)}`;
const textValue = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? '';
interface LiveHost {
  client: () => RaceChainClient;
  screen: HTMLElement;
  showRoom: () => void;
  showDialog: (content: string) => void;
  notify: (message: string) => void;
  carId: () => number;
  appearance?: () => ClubAppearance;
  input: () => number;
  begin: (controller: MultiplayerRaceController, names: string[], skins: number[], slot: number) => void;
  state: (authoritative: RaceState, predicted: RaceState) => void;
  status: (phase: string, reason: string) => void;
  finished: () => void;
  spectate: (spectator: RaceSpectator, names: string[], skins: number[]) => void;
}

/** SORA CARS presentation adapter. Shared Iroha session instruction details stay in chain/races. */
export class LiveRacingPanel {
  record: RaceRecord | null = null;
  controller: MultiplayerRaceController | null = null;
  evidence: NativeDisputeEvidence | null = null;
  spectator: RaceSpectator | null = null;
  #snapshot: { replay: RaceReplayV1; checkpoint: SignedGameCheckpointV1 } | null = null;
  #prepared: { commitment: GameInputCommitmentV1; reveal: GameInputRevealV1 } | null = null;
  #publicInputs: { commitments: GameInputCommitmentV1[]; reveals: GameInputRevealV1[] } = { commitments: [], reveals: [] };
  #host: LiveHost;
  #keys = new Map<string, InputKeyPair>();
  #invitations = new Map<string, InputKeyPair>();
  #proof: RaceProofBundle | null = null;
  #settlementEntry = '';
  #settlementOutcome = '';
  #verificationBusy = false;
  #verificationOwner: { controller: AbortController; client: RaceChainClient; raceId: string; sourceHex: string } | null = null;
  #verificationPins: Partial<SettlementVerificationTrust> = {};
  #signedSettlement: { networkId: string; sessionId: string; profileId: string; expectedEntryHash: string; outcomeCommitment: string; sourceRevision: string; sourceRecordHex: string } | null = null;
  #feeCap = '1';
  #signal = '';
  #poll: ReturnType<typeof setInterval> | null = null;
  #loading: { client: RaceChainClient; raceId: string; generation: number; promise: Promise<void> } | null = null;
  #openGeneration = 0;
  #active = false;
  #draft: { raceId: string; trackId: number; maxRacers: number; stake: string } | null = null;
  #relay = import.meta.env.VITE_SIGNALING_URL ?? '';
  #iceText = '';
  #relayOnly = false;
  #stakeNftId = '';
  #stakeInventory: GarageNft[] = [];
  #stakeOwner: string | null = null;

  constructor(host: LiveHost) {
    this.#host = host;
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-live]');
      if (target && !target.hasAttribute('disabled')) void this.action(target.dataset.live!).catch(error => host.notify(japaneseError(error)));
    });
    document.querySelector('#app')!.addEventListener('input', event => {
      const target = event.target as HTMLInputElement;
      if (target.id === 'live-stake-nft') this.#stakeNftId = target.value;
      if (target.id === 'live-fee-cap') this.#feeCap = target.value;
      if (target.id === 'live-relay') this.#relay = target.value;
      if (target.id === 'live-ice') this.#iceText = target.value;
      if (target.id === 'live-relay-only') this.#relayOnly = target.checked;
      if (target.id === 'live-settlement-expectedEntryHash') this.#settlementEntry = target.value;
      if (target.id === 'live-settlement-outcomeCommitment') this.#settlementOutcome = target.value;
      if (target.dataset.settlementPin) this.#verificationPins[target.dataset.settlementPin as keyof SettlementVerificationTrust] = target.value;
    });
    document.querySelector('#app')!.addEventListener('change', event => {
      const target = event.target as HTMLInputElement;
      if (['live-replay-file', 'live-key-file'].includes(target.id) && target.files?.[0] && this.record) {
        const file = target.files[0];
        if (file.size > PUBLIC_REPLAY_JSON_LIMIT) { host.notify('Recovery file exceeds the 16 MiB import bound.'); return; }
        void file.text().then(text => this.#importFile(target.id, JSON.parse(text))).catch(error => host.notify(japaneseError(error)));
      }
      if (target.id === 'live-proof-file' && target.files?.[0] && this.record) {
        const file = target.files[0];
        if (file.size > PROOF_BUNDLE_JSON_LIMIT) { host.notify(`Proof JSON exceeds this release’s ${PROOF_BUNDLE_JSON_LIMIT / 1024 / 1024} MiB import bound.`); return; }
        void file.text().then(text => {
          this.#proof = parseRaceProofBundle(JSON.parse(text), this.record!); this.render();
          host.notify('リプレイと公開フィールドを確認しました。完全な記録の結び付けと証明の検証はネイティブ実行が必要です。 / Replay and public fields checked. Complete source-record binding and proof verification still require native execution.');
        }).catch(error => host.notify(japaneseError(error)));
      }
    });
  }
  async list(element: HTMLElement): Promise<void> {
    const client = this.#host.client();
    if (!client.config.networkId) return;
    const page = parseRaceList(await client.listRaces(), client.config.networkId);
    const asset = import.meta.env.VITE_XOR_ASSET_DEFINITION;
    if (!asset) throw new Error('A release-pinned XOR asset definition is required.');
    const items = page.items.filter(r => r.asset_definition === asset && r.manifest.application_id === client.config.applicationId && r.manifest.profile_id === client.config.profileId);
    element.classList.remove('empty-state');
    element.innerHTML = items.length ? items.map(r => `<button class="lobby-row" data-live="open:${esc(r.race_id)}"><span>${esc(short(r.race_id))}<small>${esc(r.phase.kind.replaceAll('_', ' '))}</small></span><span>${TRACKS[gameTrack(r.rules.track)]!.name}</span><span>${r.participants.length} / ${r.rules.max_racers}</span><span>${esc(r.stake)} XOR<small>per driver</small></span></button>`).join('') : '<div class="empty-state"><span lang="ja">待</span><p>No open sessions yet. Create the next grid.</p></div>';
    japaneseInterface(element);
  }
  createDialog(trackId: number, maxRacers: number, stake: string): void {
    if (!this.#host.client().canStake) throw new Error('対戦の実行証明と通信環境の検証が必要です。 / The execution proof profile and transaction transport must be ready.');
    if (!/^[1-9][0-9]*(?:\.[0-9]+)?$/.test(stake)) throw new Error('Enter an exact positive XOR stake.');
    this.#draft = { raceId: newRaceId(), trackId, maxRacers, stake };
    this.#host.showDialog(`<p class="eyebrow">NEW SESSION / 集合</p><h2>BUILD YOUR GRID.</h2><p>${TRACKS[trackId]!.name} · ${maxRacers} drivers · ${esc(stake)} XOR per driver</p><label class="live-field">WHO CAN JOIN?<select id="live-access"><option value="public">PUBLIC GRID</option><option value="invite">PRIVATE INVITATION</option></select></label><p>Creating the session reserves the rules. Joining it is a separate wallet transaction that places your exact stake in escrow.</p>${this.#feeField()}<button class="primary" data-live="create">CREATE SESSION ↗</button>`);
  }
  #feeField(): string { return `<label class="live-field">MAXIMUM TRANSACTION FEE <span>XOR</span><input id="live-fee-cap" type="text" inputmode="decimal" value="${esc(this.#feeCap)}"></label><p class="fine-print">This wallet-approved fee limit is separate from your entry stake. It is a maximum, not a fee estimate.</p>`; }
  async #submit(instruction: object, itemInstruction?: object): Promise<string> {
    const cap = this.#feeCap, asset = import.meta.env.VITE_XOR_ASSET_DEFINITION;
    if (!asset) throw new Error('This release has no pinned XOR asset definition.');
    if (!/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/.test(cap)) throw new Error('Enter a positive exact maximum fee.');
    const fee = { payer: 'authority' as const, chargeLimits: [{ kind: 'nexus' as const, assetDefinitionId: asset, maxAmount: cap }] };
    const result = itemInstruction ? await this.#host.client().submitJoinWithItem(instruction, itemInstruction, fee) : await this.#host.client().submit(instruction, fee);
    this.#host.notify(`Endpoint reported transaction acceptance: ${short(result.hash)}. Independent finality verification is still required.`);
    return result.hash;
  }
  #key(sessionId: string, create = false): InputKeyPair | null {
    let key = this.#keys.get(sessionId);
    if (!key) {
      try {
        const saved = sessionStorage.getItem(`sora-cars:input-key:${sessionId}`);
        if (saved && /^[0-9a-f]{64}$/.test(saved)) { const privateKey = unhex(saved); key = { privateKey, publicKeyHex: hex(ed25519.getPublicKey(privateKey)) }; }
      } catch { /* Memory-only sessions still work. */ }
    }
    if (!key && create) key = newRaceInputKey();
    if (key) {
      this.#keys.set(sessionId, key);
      try { sessionStorage.setItem(`sora-cars:input-key:${sessionId}`, hex(key.privateKey)); } catch { /* No custody key is stored here. */ }
    }
    return key ?? null;
  }
  #invitation(sessionId: string, encoded?: string): InputKeyPair | null {
    let key = this.#invitations.get(sessionId);
    if (!encoded && !key) { try { encoded = sessionStorage.getItem(`sora-cars:invite-key:${sessionId}`) ?? undefined; } catch { /* Optional persistence. */ } }
    if (encoded) {
      if (!/^[0-9a-f]{64}$/.test(encoded)) throw new Error('Invalid private session invitation.');
      const privateKey = unhex(encoded); key = { privateKey, publicKeyHex: hex(ed25519.getPublicKey(privateKey)) };
      this.#invitations.set(sessionId, key);
      try { sessionStorage.setItem(`sora-cars:invite-key:${sessionId}`, encoded); } catch { /* This is an admission capability, never a wallet key. */ }
    }
    return key ?? null;
  }
  #sessionHash(id: string): string {
    const invitation = this.#invitation(id);
    return `#/session/${encodeURIComponent(id)}${invitation ? `?invite=${hex(invitation.privateKey)}` : ''}`;
  }
  async open(route: string): Promise<void> {
    this.#verificationOwner?.controller.abort();
    const generation = ++this.#openGeneration;
    const [sessionId, query] = route.split('?', 2);
    if (!sessionId) throw new Error('Missing session ID.');
    const invitation = new URLSearchParams(query).get('invite');
    if (invitation) this.#invitation(sessionId, invitation);
    const client = this.#host.client();
    if (!client.state.capability) await client.probe();
    const record = parseRaceRecord(await client.getRace(sessionId), client.config.networkId, sessionId);
    if (generation !== this.#openGeneration || client !== this.#host.client()) return;
    if (this.controller && this.record?.race_id !== sessionId && !['stopped', 'finished'].includes(this.controller.status.phase)) throw new Error('Leave your current live session before opening a different grid.');
    this.#requireReleaseTerms(record, client);
    if (this.record?.race_id === sessionId) assertSameRaceTerms(this.record, record);
    if (this.record?.race_id !== sessionId) { this.controller = null; this.#proof = null; this.#settlementEntry = ''; this.#settlementOutcome = ''; this.#verificationPins = {}; this.#signedSettlement = null; this.#snapshot = null; this.#prepared = null; this.evidence = null; this.#publicInputs = { commitments: [], reveals: [] }; this.spectator?.close(); this.spectator = null; }
    try {
      const saved = sessionStorage.getItem(`sora-cars:forced-input:${sessionId}`);
      if (saved && saved.length <= 8192) {
        const value = JSON.parse(saved);
        this.#prepared = { commitment: decodeGameValueV1('GameInputCommitmentV1', encodeGameValueV1('GameInputCommitmentV1', value.commitment)) as GameInputCommitmentV1, reveal: decodeGameValueV1('GameInputRevealV1', encodeGameValueV1('GameInputRevealV1', value.reveal)) as GameInputRevealV1 };
      }
    } catch { this.#prepared = null; }
    this.#invalidateStaleProof(record);
    this.record = record; this.#active = true; this.#host.showRoom(); this.render();
    history.replaceState(null, '', this.#sessionHash(sessionId));
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = setInterval(() => { void this.refresh().catch(error => this.#host.notify(japaneseError(error))); }, 3500);
  }
  activate(): void { this.#active = true; this.render(); }
  deactivate(): void { this.#verificationOwner?.controller.abort(); ++this.#openGeneration; this.#active = false; if (!this.controller && this.#poll) { clearInterval(this.#poll); this.#poll = null; } }
  #requireReleaseTerms(record: RaceRecord, client: RaceChainClient): void {
    if (client.config.networkId !== record.network_id) throw new Error('This session does not use the network pinned by this release.');
    if (client.config.applicationId !== record.manifest.application_id || client.config.profileId !== record.profile_id) throw new Error('This session does not use the application and proof profile pinned by this release.');
    const asset = import.meta.env.VITE_XOR_ASSET_DEFINITION;
    if (!asset || asset !== record.asset_definition) throw new Error('This session does not stake the XOR asset pinned by this release.');
  }
  #invalidateStaleProof(record: RaceRecord): boolean {
    if (!this.#proof || raceProofSourceMatches(this.#proof, record)) return false;
    this.#proof = null;
    this.#host.notify('対戦記録が変わったため、読み込んだ証明を解除しました。 / The complete session record changed. Load a new proof before submitting.');
    return true;
  }
  refresh(): Promise<void> {
    if (this.#verificationOwner && this.#verificationOwner.client !== this.#host.client()) this.#verificationOwner.controller.abort();
    if (!this.record) return Promise.resolve();
    const client = this.#host.client(), id = this.record.race_id, generation = this.#openGeneration;
    // Settlement awaits the current room's in-flight poll. A superseded room or
    // client cannot supply its refresh promise or clear a newer pending request.
    const loading = this.#loading;
    if (loading?.client === client && loading.raceId === id && loading.generation === generation) return loading.promise;
    const promise = this.#refreshRecord(client, id, generation).finally(() => {
      if (this.#loading === pending) this.#loading = null;
    });
    const pending = { client, raceId: id, generation, promise };
    this.#loading = pending;
    return promise;
  }
  async #refreshRecord(client: RaceChainClient, id: string, generation: number): Promise<void> {
    const updated = parseRaceRecord(await client.getRace(id), client.config.networkId, id);
    if (client !== this.#host.client() || generation !== this.#openGeneration || this.record?.race_id !== id) return;
    this.#requireReleaseTerms(updated, client);
    assertSameRaceTerms(this.record, updated);
    const proofInvalidated = this.#invalidateStaleProof(updated);
    const changed = proofInvalidated || updated.revision !== this.record.revision || updated.phase.kind !== this.record.phase.kind;
    if (this.#verificationOwner && this.#verificationOwner.sourceHex !== hex(encodeGameValueV1('GameSessionRecordV1', updated.source_record))) this.#verificationOwner.controller.abort();
    this.record = updated;
    if (changed && this.#active) this.render();
    if (this.controller && !['racing', 'lobby'].includes(updated.phase.kind) && this.controller.status.phase === 'racing') this.#host.status('disputed', 'The endpoint reports a native dispute. Authenticate the selected checkpoint before resuming.');
  }
  render(): void {
    if (this.#verificationOwner && this.#verificationOwner.client !== this.#host.client()) this.#verificationOwner.controller.abort();
    const r = this.record;
    if (!r) { this.#host.screen.innerHTML = '<div class="workspace"><h1>FIND YOUR GRID.</h1><p class="body-copy">Open a session from the lobby or paste its invitation link.</p></div>'; japaneseInterface(this.#host.screen); return; }
    const client = this.#host.client(), ownSlot = r.participants.findIndex(p => p.account === client.state.account), phase = r.phase.kind;
    this.#host.screen.innerHTML = `<div class="workspace session-room"><p class="eyebrow">DRIVERS’ MEETING / 集合</p><div class="section-heading"><h1>${TRACKS[gameTrack(r.rules.track)]!.japanese}<small class="english-subtitle" lang="en">${TRACKS[gameTrack(r.rules.track)]!.name.toUpperCase()}</small></h1><button class="small-button" data-live="share">INVITE ↗</button></div><p class="body-copy">${esc(short(r.race_id))} · ${esc(phase.replaceAll('_', ' ').toUpperCase())} · ${esc(r.stake)} XOR per driver</p><div class="session-trust">ENDPOINT-REPORTED STATE <span>Independent finality verification pending</span></div><div class="session-roster">${Array.from({ length: r.rules.max_racers }, (_, slot) => { const p = r.participants[slot]; return `<div class="session-driver"><span>${String(slot + 1).padStart(2, '0')}</span><i style="background:${p ? LIVERIES[p.car_id]!.color : '#51405a'}"></i><strong>${p ? slot === ownSlot ? 'YOU' : esc(short(p.account)) : 'OPEN SLOT'}</strong><small>${p ? p.dnf_at_tick !== null ? 'INPUT KEY INACTIVE' : 'JOINED' : 'WAITING'}</small></div>`; }).join('')}</div>${this.#feeField()}${equipmentTermsMarkup([])}${this.#itemTools()}<div class="lobby-actions">${phase === 'lobby' && ownSlot < 0 ? `<button class="primary" data-live="join" ${client.canStake && client.state.account ? '' : 'disabled'}>JOIN · ${esc(r.stake)} XOR ↗</button>` : ''}${phase === 'lobby' && ownSlot >= 0 ? `<button class="primary" data-live="start" ${r.participants.length >= 2 ? '' : 'disabled'}>START SESSION ↗</button>` : ''}${phase === 'racing' && ownSlot >= 0 ? '<button class="primary" data-live="drive">CONNECT TO THE GRID ↗</button>' : ''}${phase === 'racing' && ownSlot < 0 && r.manifest.access.kind === 'public' ? '<button class="primary" data-live="spectate">WATCH LIVE ↗</button>' : ''}<button class="small-button" data-live="refresh">REFRESH ↻</button><button class="text-button" data-live="bundle">EXPORT PUBLIC REPLAY ↓</button>${phase === 'settled' || phase === 'cancelled' ? `<button class="small-button" data-live="rematch" ${client.canStake ? '' : 'disabled'}>CREATE REMATCH ↗</button>` : ''}</div><p class="fine-print">Deadline: block ${esc(r.deadline_height)}. The ledger decides deadline advancement and forfeits. Leaving the page does not refund an active session.</p>${phase !== 'lobby' && phase !== 'cancelled' ? this.#proofTools() : ''}<details class="session-details"><summary>PEER CONNECTION & RECOVERY</summary><label class="live-field">SIGNALING RELAY<input id="live-relay" type="url" value="${esc(this.#relay)}" placeholder="wss://your-relay.example"></label><button class="small-button" data-live="relay">CONNECT RELAY ↗</button><p class="fine-print">An optional relay exchanges signed connection offers. Use manual offers if it is unavailable.</p>${this.#iceTools()}<div class="manual-offer"><label class="live-field">PEER SLOT<input id="live-peer" type="number" min="1" max="${r.participants.length}" value="${Math.min(r.participants.length, ownSlot + 2)}"></label><button class="small-button" data-live="offer">CREATE SIGNED OFFER</button></div><label class="live-field">SIGNED OFFER OR ANSWER<textarea id="live-signal" rows="4" spellcheck="false">${esc(this.#signal)}</textarea></label><button class="small-button" data-live="accept">ACCEPT CONNECTION DATA</button><div class="recovery-actions"><button class="small-button" data-live="challenge">${phase === 'racing' ? 'OPEN DISPUTE' : 'SUBMIT CERTIFIED CHECKPOINT'}</button><button class="small-button" data-live="advance">ADVANCE DEADLINE</button>${phase === 'lobby' ? '<button class="small-button" data-live="expire">EXPIRE UNSTARTED SESSION</button>' : ''}<button class="small-button" data-live="key-export">BACK UP GAMEPLAY KEY</button><label class="small-button upload-label">RESTORE GAMEPLAY KEY ↑<input id="live-key-file" type="file" accept="application/json,.json" hidden></label><label class="small-button upload-label">LOAD CERTIFIED REPLAY ↑<input id="live-replay-file" type="file" accept="application/json,.json" hidden></label></div>${this.#recoveryTools()}</details>${this.#payoutTools()}${this.#finalityTools()}</div>`;
    japaneseInterface(this.#host.screen);
  }
  #proofTools(): string {
    return `<section class="proof-tools"><h2>結果と証明<small class="english-subtitle" lang="en">THE FINISH LINE</small></h2><p class="fine-print">確定記録のネイティブ証明は、専用の記録室から作成できます。ローカル保存データは確定記録として扱いません。<small lang="en">Create native proofs from finalized exported records in the record office. Local gameplay saves do not establish finalized history.</small></p><div class="recovery-actions"><button class="small-button" data-live="checkpoint">RECORD CERTIFIED FINISH</button><a class="small-button" href="#/prove">証明の記録室へ<small lang="en">OPEN NATIVE PROOF WORKER →</small></a><label class="small-button upload-label">精算用エンベロープを読み込む<small lang="en">LOAD SETTLEMENT ENVELOPE ↑</small><input id="live-proof-file" type="file" accept="application/json,.json" hidden></label><button class="primary" data-live="settle" ${this.#proof && this.#host.client().canStake ? '' : 'disabled'}>SUBMIT PROOF & SETTLE ↗</button></div><p class="fine-print">記録室はこの対戦の精算ファイルを生成できません。精算には、登録・審査済みのプロファイルによる専用エンベロープのネイティブ検証が必要です。<small lang="en">The record office cannot produce settlement files for this room. Settlement requires a separate envelope verified natively under an admitted, qualified profile.</small></p>${this.#proof ? `<p class="fine-print">Loaded ${this.#proof.proof.proof_bytes.length.toLocaleString()} proof bytes. Replay and public fields checked locally. This import is pinned to the observed complete record bytes; native execution must verify the source-record binding and proof.</p>` : ''}</section>`;
  }
  #finalityTools(): string {
    const client = this.#host.client();
    const pinned = import.meta.env.VITE_FINALITY_CONTEXT_ID && import.meta.env.VITE_FINALITY_CONTEXT_HEIGHT && import.meta.env.VITE_VERIFIER_BINARY_SHA256;
    const field = (key: keyof SettlementVerificationTrust, ja: string, en: string, value = '', readonly = false) => `<label class="live-field">${ja}<small lang="en">${en}</small><input id="live-settlement-${key}" data-settlement-pin="${key}" value="${esc(value)}" ${readonly ? 'readonly' : ''} spellcheck="false"></label>`;
    const pin = (key: keyof SettlementVerificationTrust) => this.#verificationPins[key] ?? '';
    return `<details class="session-details"><summary>精算記録の検証<small lang="en">VERIFY FINALIZED SETTLEMENT</small></summary><p class="fine-print">独立に確認した参照値を入力してください。ダウンロードや接続先の報告だけでは確定性を検証できません。<small lang="en">Supply independently authenticated expectations. Downloads and endpoint reports do not establish finality.</small></p>${pinned ? `
      ${field('networkId', 'ネットワーク', 'RELEASE NETWORK', client.config.networkId ?? '', true)}
      ${field('trustedContextId', '信頼する初期コンテキスト', 'PINNED INITIAL CONTEXT', import.meta.env.VITE_FINALITY_CONTEXT_ID, true)}
      ${field('firstHeight', '初期ブロック高', 'FIRST HEIGHT', import.meta.env.VITE_FINALITY_CONTEXT_HEIGHT, true)}
      ${field('profileId', '証明プロファイル', 'RELEASE PROFILE', client.config.profileId ?? '', true)}
      ${field('expectedVerifierBinarySha256', '検証プログラムの識別子', 'PINNED VERIFIER EXECUTABLE SHA-256', import.meta.env.VITE_VERIFIER_BINARY_SHA256, true)}
      ${field('sessionId', '対戦識別子', 'INDEPENDENT SESSION ID', pin('sessionId'))}
      ${field('expectedEntryHash', 'ウォレットの精算エントリー', 'WALLET SETTLEMENT ENTRY HASH', this.#settlementEntry)}
      ${field('outcomeCommitment', '期待する結果', 'EXPECTED OUTCOME COMMITMENT', this.#settlementOutcome)}
      ${field('sourceHeight', '精算前のブロック高', 'SOURCE HEIGHT', pin('sourceHeight'))}
      ${field('sourceBlockHash', '精算前のブロックハッシュ', 'SOURCE BLOCK HASH', pin('sourceBlockHash'))}
      ${field('sourceRevision', '精算前の記録リビジョン', 'SOURCE REVISION', pin('sourceRevision'))}
      ${field('settledHeight', '精算後のブロック高', 'SETTLED HEIGHT', pin('settledHeight'))}
      ${field('settledBlockHash', '精算後のブロックハッシュ', 'SETTLED BLOCK HASH', pin('settledBlockHash'))}
      ${field('settledRevision', '精算後の記録リビジョン', 'SETTLED REVISION', pin('settledRevision'))}
      <button class="small-button" data-live="finality-bundle" ${this.#verificationBusy ? 'disabled' : ''}>検証ファイルを保存 ↓<small lang="en">EXPORT VERIFICATION FILES</small></button>
      <button class="small-button" data-live="finality-cancel" ${this.#verificationBusy ? '' : 'disabled'}>中止<small lang="en">CANCEL BEFORE PUBLICATION</small></button>
      <p class="fine-print" id="finality-status" role="status" aria-live="polite">7個のネイティブファイルを保存し、最後に記述ファイルを公開します。公開開始後は中止できません。<small lang="en">Seven native files are saved before publishing the descriptor. Publication cannot be cancelled once it starts. Native verification remains required.</small></p>
    ` : '<p class="fine-print">この開発版には、審査済みの確定コンテキストと検証プログラムの識別子がありません。<small lang="en">This development build lacks a reviewed finality context and pinned verifier executable identity.</small></p>'}</details>`;
  }
  async #exportFinality(): Promise<void> {
    if (this.#verificationBusy || !this.record) return;
    const r = this.record, client = this.#host.client(), generation = this.#openGeneration;
    const selected = (key: keyof SettlementVerificationTrust) => textValue(`live-settlement-${key}`);
    const trust = settlementVerificationTrust({ networkId: client.config.networkId ?? '', trustedContextId: import.meta.env.VITE_FINALITY_CONTEXT_ID ?? '', firstHeight: import.meta.env.VITE_FINALITY_CONTEXT_HEIGHT ?? '', profileId: client.config.profileId ?? '', expectedVerifierBinarySha256: import.meta.env.VITE_VERIFIER_BINARY_SHA256 ?? '',
      sessionId: selected('sessionId'), expectedEntryHash: selected('expectedEntryHash'), outcomeCommitment: selected('outcomeCommitment'), sourceHeight: selected('sourceHeight'), sourceBlockHash: selected('sourceBlockHash'), sourceRevision: selected('sourceRevision'), settledHeight: selected('settledHeight'), settledBlockHash: selected('settledBlockHash'), settledRevision: selected('settledRevision') });
    if (trust.sessionId !== r.race_id || trust.profileId !== r.profile_id || trust.networkId !== r.network_id) throw new Error('参照値が現在の対戦と一致しません。 / Independent selection differs from this session.');
    if (this.#signedSettlement) assertSettlementWalletBinding(trust, this.#signedSettlement);
    settlementExportOrigin(client.config.toriiUrl); settlementExportRequest(trust);
    if (!supportsFinalityDirectoryExport()) throw new Error('フォルダー保存対応のデスクトップブラウザーが必要です。 / A desktop browser with folder saving support is required.');
    const owner = { controller: new AbortController(), client, raceId: r.race_id, sourceHex: hex(encodeGameValueV1('GameSessionRecordV1', r.source_record)) };
    this.#verificationOwner = owner; this.#verificationBusy = true;
    const current = () => this.#active && this.#verificationOwner === owner && generation === this.#openGeneration && client === this.#host.client() && owner.raceId === this.record?.race_id && owner.sourceHex === hex(encodeGameValueV1('GameSessionRecordV1', this.record.source_record));
    const status = (ja: string, en: string) => { if (current()) { const element = document.querySelector('#finality-status'); if (element) element.innerHTML = `${esc(ja)}<small lang="en">${esc(en)}</small>`; } };
    const buttons = () => { const save = document.querySelector<HTMLButtonElement>('[data-live="finality-bundle"]'), cancel = document.querySelector<HTMLButtonElement>('[data-live="finality-cancel"]'); if (save) save.disabled = this.#verificationBusy; if (cancel) cancel.disabled = !this.#verificationBusy; };
    buttons();
    let directory: SettlementDirectoryExport | undefined;
    try {
      directory = await selectFinalityDirectory({ signal: owner.controller.signal, isCurrent: current,
        onProgress: (done, total) => status(`未検証ファイルを保存中: ${done} / ${total}`, `Saving unverified files: ${done} / ${total}`),
        onCommitting: () => { status('記述ファイルを公開中。完了をお待ちください。', 'Publishing descriptor; waiting for physical completion.'); const cancel = document.querySelector<HTMLButtonElement>('[data-live="finality-cancel"]'); if (cancel) cancel.disabled = true; } });
      const receipt = await collectCertifiedSettlement(client.config.toriiUrl, trust, directory.sink, { signal: owner.controller.signal });
      await directory.publish(receipt);
      const command = settlementVerificationCommand(trust, `${directory.folder}/${SETTLEMENT_DESCRIPTOR_FILE}`);
      if (!current()) return;
      this.#host.showDialog(`<p class="eyebrow">独立した検証 / INDEPENDENT VERIFICATION</p><h2>検証用フォルダーを保存しました。</h2><p lang="en">Verification folder saved. No browser verification verdict has been issued.</p><code>${esc(directory.folder)}</code><p>選択した保存先で、審査済みのネイティブIrohaを使って実行してください。<small lang="en">Run from the selected destination using the reviewed native Iroha binary. Keep the seven native files and descriptor together.</small></p><label class="live-field">検証コマンド<small lang="en">NATIVE VERIFICATION COMMAND</small><textarea rows="12" readonly spellcheck="false">${esc(command)}</textarea></label>`);
    } catch (error) {
      try { await directory?.abort(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], '検証ファイルの保存と後片付けに失敗しました。 / Export and cleanup failed.'); }
      if (current()) { status('保存を停止しました。未完成ファイルの後片付けが完了しました。', 'Export stopped; incomplete output cleanup completed.'); if (!(error instanceof DOMException && error.name === 'AbortError')) throw error; }
    } finally {
      if (this.#verificationOwner === owner) { this.#verificationOwner = null; this.#verificationBusy = false; buttons(); }
    }
  }
  #itemTools(): string {
    const r = this.record!, client = this.#host.client(), owner = client.state.account;
    if (this.#stakeOwner !== owner) { this.#stakeOwner = owner; this.#stakeInventory = []; this.#stakeNftId = ''; }
    const unjoined = !r.participants.some(p => p.account === owner);
    return `<section class="session-item-stakes"><h2>勝負にかける一品。<small lang="en">ITEMS ON THE LINE.</small></h2><p class="fine-print">自分で選んで預けたNFTだけが、単独優勝者に移ります。同着・全員失格・開始前の取消では、各所有者に返ります。<span class="english-subtitle" lang="en">Only explicitly deposited NFTs transfer to a sole winner. Ties, all-forfeit outcomes and pre-start cancellation return each item to its original owner.</span></p>${r.item_stakes.map(item => `<div class="staked-item"><b>${item.slot + 1}番 / SLOT ${item.slot + 1}</b><code>${esc(item.nft_id)}</code><span>${item.claimed ? `送付済み / TRANSFERRED → ${esc(item.recipient)}` : '預かり中 / IN ESCROW'}</span></div>`).join('') || '<p class="fine-print">現在、預けられたNFTはありません。<small lang="en">No item stakes have been deposited.</small></p>'}${r.phase.kind === 'lobby' && unjoined ? `<label class="live-field">参加時に預けるNFT（任意）<small lang="en">OPTIONAL NFT DEPOSIT WITH ENTRY</small><select id="live-stake-nft"><option value="">NFTは預けない / NO ITEM STAKE</option>${this.#stakeInventory.map(item => `<option value="${esc(item.nftId)}" ${item.nftId === this.#stakeNftId ? 'selected' : ''}>${esc(clubItem(item.sku)?.name.ja ?? item.sku)} · ${esc(item.nftId)}</option>`).join('')}</select></label><button class="small-button" data-live="load-items" ${owner && client.config.nftCatalog ? '' : 'disabled'}>所有アイテムを読み込む <small lang="en">LOAD OWNED ITEMS</small></button><p class="fine-print">選択したNFTとXORの参加ステークを、同じウォレット取引で預けます。<small lang="en">The selected NFT and exact XOR entry stake are deposited in one atomic wallet transaction.</small></p>` : ''}</section>`;
  }
  #payoutTools(): string {
    const r = this.record!;
    if (!r.payout_claims.length) return '';
    const ownSlot = r.participants.findIndex(p => p.account === this.#host.client().state.account);
    return `<section class="proof-tools"><h2>PRIZE TRANSFERS / 賞金</h2><p class="fine-print">The endpoint reports these fixed awards. An outstanding amount remains in protected escrow until its transfer succeeds; settlement alone does not mean the wallet has received it.</p>${r.payout_claims.map(claim => `<div class="result-row"><strong>DRIVER ${claim.slot + 1}</strong><span>${esc(claim.amount)} XOR awarded</span><span>${/^0(?:\.0+)?$/.test(claim.remaining) ? 'TRANSFER COMPLETE' : `${esc(claim.remaining)} XOR OUTSTANDING`}</span></div>${!/^0(?:\.0+)?$/.test(claim.remaining) ? `<button class="small-button" data-live="claim:${claim.slot}">PAY ORIGINAL WALLET ↗</button>${ownSlot === claim.slot ? `<label class="live-field">MY PAYOUT DESTINATION<input id="live-claim-destination-${claim.slot}" type="text" value="${esc(r.participants[claim.slot]!.account)}" spellcheck="false"></label><label class="live-field">AMOUNT TO TRANSFER<input id="live-claim-amount-${claim.slot}" type="text" inputmode="decimal" value="${esc(claim.remaining)}"></label><button class="small-button" data-live="claim-custom:${claim.slot}">AUTHORIZE MY PAYOUT ↗</button>` : ''}` : ''}`).join('')}<p class="fine-print">Anyone may retry an original-wallet payment. Only its wallet owner may choose a different registered destination or authorize a partial payment. Asset transfer restrictions still apply. Transaction fees are shown separately above.</p></section>`;
  }
  #iceTools(): string {
    return `<label class="live-field">NAT TRAVERSAL SERVERS (OPTIONAL)<textarea id="live-ice" rows="3" spellcheck="false" autocomplete="off" placeholder='[{"urls":"turn:your-server:3478","username":"user","credential":"temporary-password"}]'>${esc(this.#iceText)}</textarea></label><label class="fine-print"><input id="live-relay-only" type="checkbox" ${this.#relayOnly ? 'checked' : ''}> Route peer traffic through TURN only</label><p class="fine-print">Configure your own STUN/TURN service before connecting across networks. Credentials stay in this tab and are excluded from invitations and replays. Existing connections keep their current settings.</p>`;
  }
  #connect(): void {
    const r = this.record!, client = this.#host.client(), slot = r.participants.findIndex(p => p.account === client.state.account), key = this.#key(r.race_id);
    if (r.phase.kind !== 'racing' || slot < 0 || !key || key.publicKeyHex !== raceRoster(r)[slot]!.inputKeyHex) throw new Error('This browser needs the gameplay key authorized by your joined wallet.');
    if (this.controller && this.controller.status.phase !== 'stopped') { this.#host.begin(this.controller, r.participants.map((p, i) => i === slot ? 'YOU' : short(p.account)), r.participants.map(p => p.car_id), slot); return; }
    const prefix = this.#snapshot?.replay;
    const resumed = prefix ? replayConsensusFrontier(r.network_id, r, prefix) : null;
    if ((r.next_tick !== 0 || r.checkpoint?.checkpoint.tick) && !resumed) throw new Error('Load the public replay matching the selected checkpoint before resuming.');
    if (r.participants.some(p => p.dnf_at_tick !== null)) throw new Error('This session has inactive input keys. Continue through the native forced rounds or submit its terminal proof.');
    const epoch = Number(r.epoch); if (!Number.isSafeInteger(epoch)) throw new Error('Unsupported session epoch.');
    const names = r.participants.map((p, i) => i === slot ? 'YOU' : short(p.account)), skins = r.participants.map(p => p.car_id);
    const ice = iceConfiguration(parseIceServers(this.#iceText), this.#relayOnly);
    this.#publicInputs.commitments = mergeRaceCommitments(this.#publicInputs.commitments, this.controller?.session.nativeInputCommitments ?? []);
    this.#publicInputs.reveals = mergeRaceReveals(this.#publicInputs.reveals, this.controller?.session.retainedRevealedInputs ?? []);
    const controller = new MultiplayerRaceController({ appearance: this.#host.appearance?.(), iceServers: ice.iceServers, relayOnly: this.#relayOnly, scope: { networkId: r.network_id, raceId: r.race_id, profileId: r.profile_id, activeScope: activeScope(r.source_record), participants: raceRoster(r), track: r.rules.track, epoch }, slot, privateKey: key.privateKey, input: this.#host.input, names, skins, publicFeed: r.manifest.access.kind === 'public', ...(resumed ? { resume: { replay: resumed, activeSlots: r.participants.map((_, slot) => slot), expectedTranscriptRoot: checkpointTranscriptRoot(this.#scope(), resumed) } } : {}) });
    this.controller = controller;
    controller.onState = this.#host.state;
    controller.onCheckpoint = checkpoint => { this.#snapshot = { replay: controller.exportNativeReplay(), checkpoint }; };
    controller.onStatus = status => { this.#host.status(status.phase, status.reason); if (status.phase === 'finished') this.#host.finished(); };
    controller.onSignal = packet => { this.#signal = packet; const field = document.querySelector<HTMLTextAreaElement>('#live-signal'); if (field) field.value = packet; };
    controller.onDispute = evidence => { this.evidence = evidence; this.#host.notify('A peer dispute needs a native deadline decision. Your certified inputs and checkpoint are retained.'); };
    this.#host.begin(controller, names, skins, slot); controller.start();
    if (this.#relay) void controller.connectSignaling(this.#relay).catch(error => this.#host.notify(japaneseError(error)));
  }
  #download(value: unknown, name: string): void {
    const url = URL.createObjectURL(new Blob([encodePublicReplayJson(value)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  #scope(epoch = Number(this.record!.epoch)) {
    const r = this.record!;
    if (!Number.isSafeInteger(epoch)) throw new Error('Unsupported game epoch.');
    return { networkId: r.network_id, raceId: r.race_id, profileId: r.profile_id, activeScope: activeScope(r.source_record), participants: raceRoster(r), track: r.rules.track, epoch };
  }
  #replay(): RaceReplayV1 | null {
    const replay = this.controller?.exportNativeReplay() ?? this.spectator?.exportNativeReplay() ?? this.#snapshot?.replay ?? null;
    if (!replay || !this.record || !this.record.forced_batches.length) return replay;
    const tick = this.record.checkpoint?.checkpoint.tick ?? 0;
    if (replay.frames.length < tick) throw new Error('Load the complete replay through the chain-selected checkpoint.');
    const prefix = { ...replay, frames: replay.frames.slice(0, tick), dnf_events: replay.dnf_events.filter(event => event.tick < tick) };
    return replayConsensusFrontier(this.record.network_id, this.record, prefix);
  }
  #importFile(kind: string, value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recovery file.');
    const file = value as Record<string, unknown>, r = this.record!;
    if (file.version !== 1) throw new Error('Unsupported recovery file version.');
    if (kind === 'live-key-file') {
      if (file.kind !== 'sora-cars-gameplay-key' || file.network_id !== r.network_id || file.session_id !== r.race_id || typeof file.private_key !== 'string' || !/^[0-9a-f]{64}$/.test(file.private_key)) throw new Error('Gameplay backup belongs to another network or session.');
      const privateKey = unhex(file.private_key), publicKeyHex = hex(ed25519.getPublicKey(privateKey));
      if (file.public_key !== publicKeyHex || !raceRoster(r).some(p => p.inputKeyHex === publicKeyHex)) throw new Error('This gameplay key is not authorized in the native roster.');
      this.#keys.set(r.race_id, { privateKey, publicKeyHex }); this.#key(r.race_id);
      this.#host.notify('Authorized gameplay key restored for this session.'); return;
    }
    if (file.kind !== 'sora-cars-public-replay' || !file.record || typeof file.record !== 'object') throw new Error('Load a SORA CARS public replay bundle.');
    const embedded = file.record as Record<string, unknown>;
    if (embedded.network_id !== r.network_id || embedded.race_id !== r.race_id || embedded.manifest_commitment !== r.manifest_commitment || embedded.admission_commitment !== r.admission_commitment) throw new Error('Public replay belongs to another game scope.');
    const replay = decodeRaceValueV1('RaceReplayV1', encodeRaceValueV1('RaceReplayV1', file.replay)) as RaceReplayV1;
    const checkpoint = decodeGameValueV1('SignedGameCheckpointV1', encodeGameValueV1('SignedGameCheckpointV1', file.checkpoint)) as SignedGameCheckpointV1;
    if (replay.player_count !== r.participants.length || replay.track.kind !== r.rules.track.kind) throw new Error('Replay does not match the selected game.');
    const verifier = new RaceSpectator(this.#scope(Number(checkpoint.checkpoint.epoch)), { replay, checkpoint, activeSlots: r.participants.map((_, slot) => slot) });
    verifier.close();
    const recovery = file.recovery as { commitments?: unknown[]; reveals?: unknown[] } | undefined;
    if (recovery && (!Array.isArray(recovery.commitments) || !Array.isArray(recovery.reveals) || recovery.commitments.length > 7200 || recovery.reveals.length > 7200)) throw new Error('Oversized recovery evidence.');
    this.#publicInputs = { commitments: mergeRaceCommitments(this.#publicInputs.commitments, this.evidence?.commitments ?? [], this.controller?.session.nativeInputCommitments ?? [], (recovery?.commitments ?? []).map(v => decodeGameValueV1('GameInputCommitmentV1', encodeGameValueV1('GameInputCommitmentV1', v)) as GameInputCommitmentV1)), reveals: mergeRaceReveals(this.#publicInputs.reveals, this.evidence?.revealedInputs ?? [], this.controller?.session.retainedRevealedInputs ?? [], (recovery?.reveals ?? []).map(v => decodeGameValueV1('GameInputRevealV1', encodeGameValueV1('GameInputRevealV1', v)) as GameInputRevealV1)) };
    this.#snapshot = { replay, checkpoint }; this.render();
    this.#host.notify(`Replay at tick ${replay.frames.length} matches every original input-key signature. Ledger finality remains unauthenticated in this browser.`);
  }
  #recoveryTools(): string {
    const r = this.record!;
    if (!['selecting_checkpoint', 'forced_commit', 'forced_reveal'].includes(r.phase.kind)) return this.#snapshot ? `<p class="fine-print">Loaded certified public replay: tick ${this.#snapshot.replay.frames.length}.</p>` : '';
    const heading = r.phase.kind === 'selecting_checkpoint' ? 'SELECTING THE CERTIFIED FRONTIER' : r.phase.kind === 'forced_commit' ? 'COMMIT THE NEXT SIX TICKS' : 'REVEAL ACCEPTED CONTROLS';
    return `<section class="proof-tools"><h2>${heading}</h2><p class="fine-print">Round ${esc(r.epoch)} · tick ${r.next_tick} · deadline block ${esc(r.deadline_height)}. Everyone may relay matching public evidence. Each action requests a separate bounded wallet fee.</p>${r.phase.kind === 'forced_commit' ? '<label class="live-field">SIX INPUT WORDS<input id="live-forced-controls" value="1 1 1 1 1 1" spellcheck="false"></label><p class="fine-print">Add control values: gas 1, brake 2, left 4, right 8, drift 16, boost 32. One word per simulated tick. Example: gas + right = 9.</p><button class="small-button" data-live="forced-input">COMMIT MY INPUTS</button>' : ''}${r.phase.kind !== 'selecting_checkpoint' ? '<button class="small-button" data-live="relay-inputs">RELAY MATCHING ROUND EVIDENCE</button>' : '<p class="fine-print">Submit your latest certificate and pending commitment set before the selection deadline. Controls become admissible only after the ledger selects that frontier.</p>'}</section>`;
  }
  async #spectate(): Promise<void> {
    if (this.record!.manifest.access.kind !== 'public') throw new Error('This private grid does not publish a spectator feed.');
    if (!this.#relay) throw new Error('Enter the public session’s signaling relay in Peer connection & recovery.');
    if (this.controller && !['stopped', 'finished'].includes(this.controller.status.phase)) throw new Error('Your gameplay connection is already active.');
    this.spectator?.close();
    const snapshot = this.#snapshot;
    const spectator = new RaceSpectator(this.#scope(), snapshot ? { ...snapshot, activeSlots: this.record!.participants.map((_, slot) => slot) } : undefined);
    this.spectator = spectator;
    spectator.onState = state => this.#host.state(state, state);
    spectator.onStatus = reason => this.#host.status('spectating', reason);
    spectator.onCheckpoint = checkpoint => { this.#snapshot = { replay: spectator.exportNativeReplay(), checkpoint }; };
    spectator.onSnapshotRequired = () => this.#host.notify('Load a signed public replay from a racer to join this feed in progress.');
    this.#host.spectate(spectator, this.record!.participants.map(p => short(p.account)), this.record!.participants.map(p => p.car_id));
    await spectator.connect(this.#relay);
  }
  async action(name: string): Promise<void> {
    if (name.startsWith('open:')) { await this.open(name.slice(5)); return; }
    if (name === 'create') {
      if (!this.#draft) return;
      if (!this.#host.client().canStake) throw new Error('対戦の実行証明と通信環境の検証が必要です。 / The execution proof profile and transaction transport must be ready.');
      const height = this.#host.client().state.capability?.current_height;
      if (typeof height !== 'string' || !/^[0-9]+$/.test(height)) throw new Error('The endpoint did not report a valid current block height.');
      const asset = import.meta.env.VITE_XOR_ASSET_DEFINITION; if (!asset) throw new Error('A release-pinned XOR asset definition is required.');
      const applicationId = import.meta.env.VITE_GAME_APPLICATION_ID, profileId = import.meta.env.VITE_EXECUTION_PROFILE_ID;
      if (!applicationId || !profileId) throw new Error('This release must pin the game application and execution profile.');
      const invited = textValue('live-access') === 'invite';
      const invitation = invited ? this.#invitation(this.#draft.raceId) ?? this.#invitation(this.#draft.raceId, hex(newRaceInputKey().privateKey)) : null;
      await this.#submit(openRace({ ...this.#draft, applicationId, profileId, access: invitation ? { kind: 'invite', public_key: inputKeyLiteral(invitation) } : { kind: 'public', public_key: null }, assetDefinition: asset, joinDeadlineHeight: (BigInt(height) + 120n).toString() }));
      document.querySelector<HTMLDialogElement>('#dialog')?.close(); await this.open(this.#draft.raceId); this.#draft = null; return;
    }
    if (!this.record) return;
    const id = this.record.race_id;
    if (name.startsWith('claim:') || name.startsWith('claim-custom:')) {
      const slot = Number(name.split(':')[1]);
      const claim = this.record.payout_claims.find(value => value.slot === slot);
      if (!claim || /^0(?:\.0+)?$/.test(claim.remaining)) throw new Error('No outstanding payout for this driver.');
      const custom = name.startsWith('claim-custom:');
      if (custom && this.record.participants[slot]!.account !== this.#host.client().state.account) throw new Error('Only the winning wallet can redirect its payout.');
      await this.#submit(claimRacePayout(id, slot, custom ? textValue(`live-claim-destination-${slot}`) : this.record.participants[slot]!.account, custom ? textValue(`live-claim-amount-${slot}`) : claim.remaining));
      await this.refresh(); this.render();
    }
    else if (name === 'refresh') { await this.#host.client().probe(); await this.refresh(); this.render(); }
    else if (name === 'load-items') {
      const client = this.#host.client(), account = client.state.account;
      if (!account || !client.config.nftCatalog) throw new Error('承認済みコレクションとウォレット接続が必要です。 / Connect a wallet with a released collection.');
      const inventory = garageInventory(await client.listOwnedNfts(), client.config.nftCatalog);
      if (client !== this.#host.client() || account !== client.state.account) throw new Error('ウォレット接続が変わりました。 / Wallet changed.');
      this.#stakeOwner = account; this.#stakeInventory = inventory.items; this.#stakeNftId = ''; this.render();
    }
    else if (name === 'join') {
      this.#requireReleaseTerms(this.record, this.#host.client());
      const key = this.#key(id, true)!, car = this.#host.carId(), access = this.record.manifest.access;
      let signature: string | null = null;
      if (access.kind === 'invite') {
        const invitation = this.#invitation(id), wallet = this.#host.client().state.account;
        if (!invitation || !wallet || inputKeyLiteral(invitation) !== access.public_key) throw new Error('Use the private invitation link for this session.');
        signature = raceInvitation(this.record.network_id, id, this.record.manifest_commitment, wallet, key, car, invitation.privateKey);
      }
      const nftId = this.#stakeNftId;
      if (nftId && !this.#stakeInventory.some(item => item.nftId === nftId && item.owner === this.#host.client().state.account)) throw new Error('預けるNFTを再確認してください。 / Reload the selected NFT.');
      await this.#submit(joinRace(this.record, key, car, signature), nftId ? stakeRaceItem(id, nftId, this.record.manifest_commitment) : undefined);
      this.#stakeNftId = ''; this.#stakeInventory = []; await this.refresh();
    }
    else if (name === 'start') { await this.#submit(startRace(id)); await this.refresh(); }
    else if (name === 'rematch') this.createDialog(gameTrack(this.record.rules.track), Math.max(2, this.record.participants.length), this.record.stake);
    else if (name === 'drive') this.#connect();
    else if (name === 'spectate') await this.#spectate();
    else if (name === 'relay') { if (!this.controller) throw new Error('Connect to the grid first.'); await this.controller.connectSignaling(this.#relay); }
    else if (name === 'offer') { if (!this.controller) throw new Error('Connect to the grid first.'); this.#signal = await this.controller.createOffer(Number(textValue('live-peer')) - 1); this.render(); }
    else if (name === 'accept') { if (!this.controller) throw new Error('Connect to the grid first.'); const answer = await this.controller.acceptSignal(textValue('live-signal')); if (answer) this.#signal = answer; this.render(); }
    else if (name === 'advance') { await this.#submit(advanceRaceDeadline(id)); await this.refresh(); }
    else if (name === 'expire') { await this.#submit(expireRace(id)); await this.refresh(); }
    else if (name === 'share') {
      if (this.record.manifest.access.kind === 'invite' && !this.#invitation(id)) throw new Error('This browser does not have the private invitation capability.');
      const link = new URL(location.href); link.hash = this.#sessionHash(id).slice(1); await navigator.clipboard.writeText(link.href);
      this.#host.notify(this.record.manifest.access.kind === 'invite' ? 'Private invitation copied. Anyone with this link can join an open slot.' : 'Session link copied.');
    }
    else if (name === 'bundle') {
      const replay = this.#replay(), recovery = { commitments: mergeRaceCommitments(this.#publicInputs.commitments, this.evidence?.commitments ?? [], this.controller?.session.nativeInputCommitments ?? []), reveals: mergeRaceReveals(this.#publicInputs.reveals, this.evidence?.revealedInputs ?? [], this.controller?.session.retainedRevealedInputs ?? []) };
      let historyEvidence = null, historyError: string | null = null;
      try { if (!replay) throw new Error('Public driving replay is unavailable.'); historyEvidence = collectAcceptedHistory(this.record, replay, recovery); }
      catch (error) { historyError = error instanceof Error ? error.message : String(error); }
      this.#download({ version: 1, kind: 'sora-cars-public-replay', authentication: 'endpoint-reported-unverified', record: this.record, replay, checkpoint: this.controller?.checkpoint ?? this.#snapshot?.checkpoint ?? this.record.checkpoint, pending_frontier: this.evidence?.frontier ?? null, recovery, history_evidence: historyEvidence, history_evidence_missing: historyError }, `sora-cars-${id}-public-replay.json`);
    }
    else if (name === 'settle') {
      if (!this.#proof) throw new Error('Load a native execution proof first.');
      const loaded = this.#proof, client = this.#host.client(), generation = this.#openGeneration;
      await this.refresh();
      if (client !== this.#host.client() || generation !== this.#openGeneration || this.record?.race_id !== id) throw new Error('精算前に接続先か対戦が変更されました。 / The connection or session changed before submission.');
      assertRaceProofSourceUnchanged(loaded, this.record);
      if (this.#proof !== loaded) throw new Error('精算前に証明が変更されました。 / The loaded proof changed before submission.');
      const bundle = parseRaceProofBundle(loaded, this.record!);
      const signedSource = { networkId: this.record!.network_id, sessionId: id, profileId: this.record!.profile_id, outcomeCommitment: bundle.proof.statement.outcome_commitment, sourceRevision: String(this.record!.source_record.revision), sourceRecordHex: bundle.sourceRecordHex };
      const entry = await this.#submit(settleRace(id, bundle.proof, bundle.outcome));
      // Wallet approval may outlive this room. Acceptance was already reported
      // by #submit; do not attach its receipt or refresh a superseding context.
      const current = () => client === this.#host.client() && generation === this.#openGeneration && this.record?.race_id === id;
      if (!current() || this.#proof !== loaded || !this.record || !raceProofSourceMatches(loaded, this.record)) return;
      this.#signedSettlement = Object.freeze({ ...signedSource, expectedEntryHash: entry });
      this.#verificationPins.sessionId = signedSource.sessionId; this.#verificationPins.sourceRevision = signedSource.sourceRevision;
      this.#settlementEntry = entry;
      this.#settlementOutcome = bundle.proof.statement.outcome_commitment;
      await this.refresh();
      if (current()) this.render();
    }
    else if (name === 'finality-bundle') await this.#exportFinality();
    else if (name === 'finality-cancel') this.#verificationOwner?.controller.abort();
    else if (name === 'key-export') { const key = this.#key(id); if (!key) throw new Error('No gameplay key is stored for this session.'); this.#download({ version: 1, kind: 'sora-cars-gameplay-key', network_id: this.record.network_id, session_id: id, public_key: key.publicKeyHex, private_key: hex(key.privateKey) }, `sora-cars-${id}-gameplay-key.json`); }
    else if (name === 'challenge') {
      await this.refresh();
      const r = this.record!, slot = r.participants.findIndex(p => p.account === this.#host.client().state.account), key = this.#key(id);
      if (r.phase.kind === 'racing') {
        if (!key || slot < 0 || inputKeyLiteral(key) !== r.participants[slot]!.input_key) throw new Error('Your authorized gameplay key is required to open a dispute.');
        await this.#submit(challengeRace(this.#scope(), r.epoch, slot, key.privateKey));
      } else if (r.phase.kind === 'selecting_checkpoint') {
        const cp = this.evidence?.checkpoint ?? this.controller?.checkpoint ?? this.#snapshot?.checkpoint;
        if (!cp) throw new Error('Load a checkpoint signed by all original racers.');
        const frontier = this.evidence?.frontier ?? this.controller?.session.pendingFrontier ?? null;
        await this.#submit(publishCheckpoint(cp, frontier, checkpointOpenings(r, cp, frontier, this.#publicInputs.reveals, this.evidence?.revealedInputs ?? [], this.controller?.session.retainedRevealedInputs ?? [])));
      } else throw new Error('Use the actions for the current forced input phase, or submit a terminal execution proof.');
      await this.refresh();
    } else if (name === 'relay-inputs') {
      await this.refresh();
      const selected = recoveryInputs(this.record!, [...(this.evidence?.commitments ?? []), ...this.#publicInputs.commitments, ...(this.#prepared ? [this.#prepared.commitment] : [])], [...(this.evidence?.revealedInputs ?? []), ...this.#publicInputs.reveals, ...(this.#prepared ? [this.#prepared.reveal] : [])]);
      if (!selected.commitments.length && !selected.reveals.length) throw new Error('No missing evidence matches the current native input round.');
      const seen = new Set<number>();
      for (const commitment of selected.commitments) { if (!seen.has(commitment.slot)) { seen.add(commitment.slot); await this.#submit(publishInputCommitment(commitment)); } }
      for (const reveal of selected.reveals) { if (!seen.has(reveal.slot)) { seen.add(reveal.slot); await this.#submit(publishInputReveal(reveal)); } }
      await this.refresh();
    } else if (name === 'forced-input') {
      const words = textValue('live-forced-controls').split(/[ ,]+/).map(Number);
      if (words.length !== 6 || words.some(n => !Number.isInteger(n) || n < 0 || n > 63)) throw new Error('Enter six canonical control words between 0 and 63.');
      await this.refresh();
      const r = this.record!, slot = r.participants.findIndex(p => p.account === this.#host.client().state.account), key = this.#key(id);
      if (!key) throw new Error('Restore your authorized gameplay key.');
      if (r.input_commitments[slot]) throw new Error('This round already has your committed inputs. Reveal the original controls.');
      if (!this.#prepared || String(this.#prepared.commitment.epoch) !== r.epoch || this.#prepared.commitment.start_tick !== r.next_tick) this.#prepared = forcedRaceInput(r, slot, key, words);
      try { sessionStorage.setItem(`sora-cars:forced-input:${id}`, JSON.stringify(this.#prepared)); } catch { throw new Error('This browser cannot retain the reveal. Enable session storage before committing a forced input round.'); }
      await this.#submit(publishInputCommitment(this.#prepared.commitment)); await this.refresh();
    } else if (name === 'checkpoint') {
      await this.refresh();
      const cp = this.controller?.checkpoint;
      if (!cp || !this.controller || this.record?.race_id !== id) throw new Error('No certified checkpoint is ready.');
      const frontier = this.controller.session.pendingFrontier;
      await this.#submit(publishCheckpoint(cp, frontier, checkpointOpenings(this.record, cp, frontier, this.#publicInputs.reveals, this.evidence?.revealedInputs ?? [], this.controller.session.retainedRevealedInputs)));
    }
  }
}
