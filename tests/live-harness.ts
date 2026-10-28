import '../src/style.css';
import { LiveRacingPanel } from '../src/ui/live';
import type { RaceChainClient } from '../src/chain/client';
import { ed25519 } from '@noble/curves/ed25519';
import type { RaceReplayV1 } from '@iroha/iroha-js/race';
import type { SignedGameCheckpointV1 } from '@iroha/iroha-js/game';
import { activeScope, checkpointSigningFrame } from '../src/chain/certificates';
import { simulateNativeReplay } from '../src/network/controller';
import { stateRoot, checkpointTranscriptRoot, raceContext } from '../src/chain/races';
import { releaseClubCatalog } from '../src/chain/catalog';
import { CLUB_ITEMS, clubItemMetadata } from '../src/game/catalog';
import { japaneseInterface, japaneseError } from '../src/ui/language';
import { raceFinished } from '../src/game/engine';

/** Browser-only test surface. The production entry point never imports this module. */
Object.assign(globalThis, { setupLiveHarness: async (initial: Record<string, any>, joinOwner?: string, toriiUrl?: string) => {
  let raw = structuredClone(initial);
  let holdRead = false, releaseRead: (() => void) | null = null;
  const messages: string[] = [], sent: any[] = [];
  const batches: any[] = [];
  const catalog = joinOwner ? releaseClubCatalog(JSON.stringify({ domain: 'sora_cars.universal', sellers: [joinOwner] }), raw.manifest.application_id, raw.asset_definition) : undefined;
  const inventory = joinOwner ? [
    { id: 'entry_0001$sora_cars.universal', ownedBy: joinOwner, metadata: clubItemMetadata(CLUB_ITEMS[0]!, raw.manifest.application_id) },
    { id: 'unreviewed_0002$sora_cars.universal', ownedBy: joinOwner, metadata: { sora_cars: { sku: 'aki-first-light' } } },
  ] : [];
  let watched = false;
  const client = {
    config: { networkId: raw.network_id, applicationId: raw.manifest.application_id, profileId: raw.profile_id, nftCatalog: catalog, toriiUrl },
    canStake: !!joinOwner,
    state: { account: joinOwner ?? raw.participants[0].account, capability: { current_height: '100' } },
    getRace: async () => {
      const captured = structuredClone(raw);
      if (holdRead) { holdRead = false; await new Promise<void>(resolve => { releaseRead = resolve; }); releaseRead = null; }
      return captured;
    }, probe: async () => {},
    listOwnedNfts: async () => ({ ownerAccountId: joinOwner, verification: 'endpoint_reported', items: structuredClone(inventory) }),
    submitJoinWithItem: async (join: object, item: object, fee: object) => {
      batches.push({ join, item, fee }); return { hash: '00'.repeat(32) };
    },
    submit: async (instruction: any) => {
      sent.push(instruction);
      if (instruction.ChallengeGameSessionV1) raw.phase.kind = 'selecting_checkpoint';
      if (instruction.CommitGameInputsV1) { const v = instruction.CommitGameInputsV1.input; raw.input_commitments[v.slot] = v.commitment; }
      if (instruction.RevealGameInputsV1) { const v = instruction.RevealGameInputsV1.reveal; raw.input_reveals[v.slot] = v.payload; }
      raw.revision = String(BigInt(raw.revision) + 1n);
      return { hash: '00'.repeat(32) };
    },
  } as unknown as RaceChainClient;
  const showDialog = (content: string) => {
    document.querySelector('#harness-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'harness-dialog';
    dialog.innerHTML = content; document.querySelector('#app')!.append(dialog);
    japaneseInterface(dialog); dialog.showModal();
  };
  const panel = new LiveRacingPanel({ client: () => client, screen: document.querySelector('#screen')!, showRoom: () => {}, showDialog, notify: message => {
    messages.push(message);
    let status = document.querySelector('#harness-status');
    if (!status) { status = document.createElement('p'); status.id = 'harness-status'; document.querySelector('#app')!.append(status); }
    status.textContent = japaneseError(message); japaneseInterface(status);
  }, carId: () => 0, input: () => 1, begin: () => {}, state: () => {}, status: () => {}, finished: () => {}, spectate: () => { watched = true; } });
  await panel.open(raw.session_id);
  Object.assign(globalThis, { liveHarness: {
    panel, sent, messages, batches,
    replaceEndpointRecord: (record: Record<string, any>) => { raw = structuredClone(record); },
    holdNextRead: () => { holdRead = true; },
    readHeld: () => releaseRead !== null,
    releaseRead: () => releaseRead?.(),
    switchWallet: (account: string) => { client.state.account = account; panel.render(); },
    phase: async (phase: string) => { raw.phase.kind = phase; raw.revision = String(BigInt(raw.revision) + 1n); await panel.refresh(); },
    observer: () => { client.state.account = null; panel.render(); },
    watched: () => watched,
    certifiedSnapshot: (ticks = 12, control = 1) => {
      const r = panel.record!, replay: RaceReplayV1 = { track: r.rules.track, player_count: 2, frames: Array.from({ length: ticks }, (_, tick) => ({ tick, controls: [control, control] })), dnf_events: [] };
      const state = simulateNativeReplay(replay);
      const body = { session_id: r.race_id, scope: activeScope(r.source_record), epoch: r.epoch, tick: ticks, transcript_root: checkpointTranscriptRoot(raceContext(r), replay), state_root: stateRoot(raceContext(r), state), terminal: raceFinished(state) };
      const checkpoint: SignedGameCheckpointV1 = { checkpoint: body, signatures: [27, 29].map((seed, slot) => ({ slot, signature: Array.from(ed25519.sign(checkpointSigningFrame(r.network_id, body), new Uint8Array(32).fill(seed)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase() })) };
      return { version: 1, kind: 'sora-cars-public-replay', authentication: 'endpoint-reported-unverified', record: r, replay, checkpoint, recovery: { commitments: [], reveals: [] } };
    },
    snapshot: () => structuredClone(raw),
  } });
} });
