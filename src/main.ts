import { MUSIC_LIBRARY } from './game/music-score';
import { resolveCutsceneCue } from './game/music-cues';
import { resolveStoryShot } from './game/story-scenes';
import { RACE_RULES_HASH, environmentAt, environmentContacts } from './game/environment';
import { setEnvironmentContacts, type EnvironmentContact } from './game/environment-events';
import './style.css';
import './ui/story.css';
import './ui/story-workshop.css';
import './ui/scene-preparation.css';
import './ui/music-store.css';
import './ui/tech-garage.css';
import { MusicStore } from './ui/music-store';
import { readSceneReadiness, ScenePreparationCover } from './ui/scene-preparation';
import { CONTROL as C, LIVERIES, TRACKS } from './game/rules';
import { applyReplayDnf, botControl, copyRace, createRace, raceFinished, rankCars, stepRace, type RaceState } from './game/engine';
import { GARAGE_RULES, isGarageReplay, localReplayState, validateLocalReplay, type LocalReplay } from './game/garage-replay';
import { garageBotControl } from './game/garage-ai';
import { pitBriefing } from './game/story-pit';
import { PRACTICE_FIELDS, applyAward, fieldRivals, garageTune, practiceField, raceAward, readGarage, storyRivals, type FieldId, type GarageSave, type RaceAward, type Rival } from './game/garage-tech';
import { STOCK_TUNE, inWake, isStockTune, stepTunedRace, type CarTune } from './game/tuned-engine';
import { TechGarage, garageSummary, yen } from './ui/tech-garage';
import { RaceRenderer, formatTime, type ReplayCamera } from './game/renderer';
import { RacePresentation, raceResultPlaces } from './game/presentation';
import { getPixelFinish, setPixelFinish } from './game/three/graphics';
import { GameAudio } from './game/audio';
import { CHAPTERS, CREW, RETRY_SCENE, storyGrid, storyObjective, storyObjectiveMet, storyProgress, completeStoryChapter, type Dialogue } from './game/story';
import { storyMenu, CutscenePlayer, type CutsceneOptions } from './ui/story';
import { storyWorkshopRoute } from './game/story-workshop';
import { ProofWorkshop } from './ui/proofs';
import { FinalizedProvingPanel } from './ui/finalized-prover';
import { japaneseInterface, japaneseError } from './ui/language';
import { ClubGarage } from './ui/garage';
import { releaseClubCatalog, releaseMusicCatalog, mergeNftCatalogs } from './chain/catalog';
import { RaceChainClient } from './chain/client';
import { releaseNetworkId, TAIRA_TORII_URL } from './chain/taira';
import { LiveRacingPanel } from './ui/live';
import type { RaceSpectator } from './network/spectator';
import type { MultiplayerRaceController } from './network/controller';
import QRCode from 'qrcode';
import { StreetPractice, downloadStreetReplay } from './ui/street-practice';
import { decodeStreetReplay, encodeStreetReplay, STREET_REPLAY_TYPE, MAX_STREET_REPLAY_BYTES, type StreetReplay } from './game/street/replay';

type View = 'soundtrack' | 'street' | 'home' | 'prove' | 'proofs' | 'story' | 'cutscene' | 'pit' | 'garage' | 'tuning' | 'shop' | 'lobby' | 'room' | 'history' | 'settings' | 'race' | 'results';
const base = import.meta.env.BASE_URL;
const flag = `${base}assets/sora-flag.png`;
const escape = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const names = [...CREW.map(c => c.name.ja), 'YOU', 'SORAゲスト'];
const prefsKey = 'sora-cars:prefs:v1', historyKey = 'sora-cars:history:v1';
function storageRead<T>(key: string, fallback: T): T { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } }
const storyKey = 'sora-cars:story:sky-1986';
let unlockedChapter = storyProgress(storageRead(storyKey, 0)), storyRun: number | null = null;
let storyResult: number | null = null;
const prefs = storageRead(prefsKey, { car: 0, track: 0, music: 30, effects: 35, torii: TAIRA_TORII_URL, field: 'club' as FieldId });
let carId = LIVERIES[prefs.car] ? prefs.car : 0, trackId = TRACKS[prefs.track] ? prefs.track : 0;
let view: View = 'home', previousView: View = 'home', paused = false, currentRace = createRace(trackId, 8), playerSlot = 6;
let skins = currentRace.cars.map(c => c.slot % 6), raceNames = [...names], inputs: number[][] = [];
let countdown = 3, lastCountdown = 4, accumulated = 0, elapsed = 0, lastTime = performance.now(), replay: LocalReplay | null = null;
// Garage races: per-slot tunes and drivers. Null tunes means the unchanged RaceV1 circuit.
const garageKey = 'sora-cars:garage:v1';
let garageSave = readGarage(storageRead<unknown>(garageKey, null));
let raceTunes: CarTune[] | null = null, raceRivals: (Rival | null)[] = [], raceField: FieldId | null = null;
let raceStats = { offroad: 0, impacts: 0 }, lastAward: RaceAward | null = null;
const selectedField = (): FieldId => garageSave.stock || !garageSave.fields.includes(prefs.field) ? 'club' : prefs.field;
const replayCameras: ReplayCamera[] = ['chase', 'bumper', 'aerial'];
const cameraNames = ['追走 / CHASE', '路面 / BUMPER', '上空 / AERIAL'];
let replayCamera = 0;
let replaySpeed = 1, resultSaved = false, manualClock = false, gamepadActive = false, controls = 0;
let lastRenderTime = 0;
let localScenePreparing = false, scenePreparationError = '';
let lastSoundTick = -1, lastSoundContactTick = -1;
let networkRace: MultiplayerRaceController | null = null, predictedRace: RaceState | null = null;
let spectator: RaceSpectator | null = null;
const keys = new Set<string>(), touch = new Set<string>();
const drivingKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyX']);
const audio = new GameAudio(); audio.musicEnabled = true; audio.setVolumes(prefs.music / 100, prefs.effects / 100); audio.setTrack(trackId);
function unlockAudio(): void {
  if (audio.context?.state !== 'running') void audio.unlock().catch(() => { /* Retry on the next user gesture. */ });
}
// Play immediately where allowed; browser autoplay restrictions may require a gesture.
unlockAudio();
window.addEventListener('pointerup', unlockAudio, { capture: true });
window.addEventListener('click', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
let chain = makeChain();
const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `<canvas id="race-canvas" aria-label="Live arcade racing view"></canvas>
  <div class="world-shade"></div><div class="paper-grain"></div>
  <header class="header"><button class="brand" data-action="home" aria-label="SORA CARS home"><img src="${flag}" alt="SORA flag"><span>SORA<span class="brand-cars"> CARS</span></span></button>
  <nav aria-label="Main navigation"><button data-action="home">走る <span lang="en">RACE</span></button><button data-action="garage">車庫 <span lang="en">GARAGE</span></button><button data-action="story">物語 <span lang="en">STORY</span></button><button data-action="soundtrack">音楽 <span lang="en">MUSIC</span></button><button data-action="history">記録 <span lang="en">RECORDS</span></button><button data-action="proofs">証明 <span lang="en">PROOFS</span></button></nav>
  <div class="header-tools"><button class="sound-button" data-action="music" aria-label="Turn music off">♫ <span>MUSIC ON</span></button><button class="wallet-button" data-action="wallet">CONNECT WALLET <span>↗</span></button></div></header>
  <section id="screen" aria-live="polite"></section>
  <footer class="footer"><span class="network"><i></i> SORA NEXUS <b>TAIRA TESTNET</b></span><span class="footer-center">THE ROAD IS YOURS. <span lang="ja">自由に走れ。</span></span><button data-action="settings" aria-label="Open settings">SETTINGS <span>⚙</span></button></footer>
  <div id="race-tools" hidden><button data-action="pause" aria-label="Pause race">Ⅱ</button><button data-action="music" aria-label="Toggle music">♫</button></div>
  <div id="touch-controls" hidden><div class="steer-buttons"><button data-control="left" aria-label="Steer left">◀</button><button data-control="right" aria-label="Steer right">▶</button></div><div class="pedal-buttons"><button data-control="drift" class="drift-button">DRIFT</button><button data-control="boost" class="boost-button">TURBO</button><button data-control="brake" class="brake-button">BRAKE</button><button data-control="throttle" class="gas-button">GAS</button></div></div>
  <div id="toast" role="status"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>`;
const screen = document.querySelector<HTMLElement>('#screen')!, canvas = document.querySelector<HTMLCanvasElement>('#race-canvas')!;
const sceneCover = new ScenePreparationCover(root);
const cutscene = new CutscenePlayer(screen);
const proofWorkshop = new ProofWorkshop(screen);
const nativeProof = new FinalizedProvingPanel(screen);
const presentation = new RacePresentation();
const renderer = new RaceRenderer(canvas), dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
const observer = new ResizeObserver(() => view === 'street' ? street.resize() : renderer.resize()); observer.observe(canvas);
const live = new LiveRacingPanel({
  client: () => chain, screen, showRoom: () => setView('room'), showDialog, notify: toast,
  carId: () => carId, appearance: () => garage.appearance, input: () => view === 'race' && !paused ? playerControls() : 0,
  begin: (controller, names, colors, slot) => {
    spectator?.close(); spectator = null; networkRace = controller; replay = null; currentRace = controller.state; predictedRace = controller.predictedState;
    trackId = currentRace.trackId; raceNames = names; skins = colors; playerSlot = slot; countdown = -1;
    resultSaved = false; audio.setTrack(trackId); void audio.unlock(); setView('race');
  },
  state: (authoritative, predicted) => { currentRace = authoritative; predictedRace = predicted; },
  status: (phase, reason) => {
    if (!['racing', 'waiting'].includes(phase)) audio.stopDrive();
    const status = document.querySelector<HTMLElement>('#peer-status');
    if (status) { status.dataset.phase = phase; status.textContent = reason; japaneseInterface(status); }
  },
  finished: () => finishSession(),
  spectate: (feed, names, colors) => {
    networkRace = null; spectator = feed; replay = null; currentRace = feed.state; predictedRace = null;
    trackId = currentRace.trackId; raceNames = names; skins = colors; playerSlot = 0; countdown = -1;
    resultSaved = true; audio.setTrack(trackId); setView('race');
  },
});

const garage = new ClubGarage({ client: () => chain, screen, active: () => view === 'shop', showDialog, closeDialog: () => dialog.close(), notify: toast });
function saveGarage(next: GarageSave): void {
  garageSave = next;
  try { localStorage.setItem(garageKey, JSON.stringify(next)); } catch { toast('保存領域がいっぱいです。進行はこのページを閉じるまで保たれます。 / Storage is full; garage progress lasts until this page closes.'); }
}
// The tech tree page, and the pre-race garage between a story chapter's cutscenes and its race.
const tuning = new TechGarage({ screen, active: () => view === 'tuning' || view === 'pit', notify: toast, save: () => garageSave, commit: saveGarage,
  field: selectedField, setField: field => { prefs.field = field; savePrefs(); }, chapter: () => view === 'pit' ? storyRun : null });
const records = new MusicStore({ client: () => chain, screen, active: () => view === 'soundtrack', showDialog, closeDialog: () => dialog.close(), notify: toast });
const streetHistoryKey = 'sora-cars:street-history';
function getStreetHistory(): StreetReplay[] {
  try {
    const text = localStorage.getItem(streetHistoryKey); if (!text || text.length > 3_000_000) return [];
    const rows: unknown = JSON.parse(text); if (!Array.isArray(rows) || rows.length > 5) return [];
    return rows.flatMap(row => { try { return typeof row === 'string' ? [decodeStreetReplay(row)] : []; } catch { return []; } });
  } catch { return []; }
}
function syncStreetTools(): void {
  if (view !== 'street') return;
  document.querySelector<HTMLElement>('#race-tools')!.hidden = !['countdown', 'driving', 'paused'].includes(street.state.phase);
  document.querySelector<HTMLElement>('#touch-controls')!.hidden = !street.activeInput;
  if (street.activeInput) return;
  touch.clear(); document.querySelectorAll('[data-control].pressed').forEach(button => button.classList.remove('pressed'));
}
const street = new StreetPractice({ canvas, screen, audio, notify: toast, onChange: syncStreetTools,
  onExit: () => { currentRace = createRace(trackId, 8); setView('home'); },
  onSaved: record => {
    try { localStorage.setItem(streetHistoryKey, JSON.stringify([encodeStreetReplay(record), ...getStreetHistory().map(encodeStreetReplay)].slice(0, 5))); }
    catch { toast('記録の保存領域がいっぱいです。ダウンロードできます。 / Storage is full. Download this replay from the results.'); }
  },
});
async function startStreet(imported?: StreetReplay): Promise<void> {
  if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) throw new Error('ライブ対戦を終了してから東京へ。 / Leave your live race before starting Tokyo.');
  spectator?.close(); spectator = null; networkRace?.stop(); networkRace = null; predictedRace = null;
  replay = null; storyRun = null; storyResult = null; audio.stopDrive();
  setView('street'); await street.open('tokyo-1986', carId, imported);
}


function makeChain(toriiUrl = prefs.torii): RaceChainClient {
  return new RaceChainClient({ toriiUrl, nftCatalog: mergeNftCatalogs(releaseClubCatalog(import.meta.env.VITE_NFT_COLLECTION, import.meta.env.VITE_GAME_APPLICATION_ID, import.meta.env.VITE_XOR_ASSET_DEFINITION), releaseMusicCatalog(import.meta.env.VITE_MUSIC_COLLECTION, import.meta.env.VITE_GAME_APPLICATION_ID, import.meta.env.VITE_XOR_ASSET_DEFINITION)), nftMarketQualified: import.meta.env.VITE_NFT_MARKET_QUALIFIED === 'true', nftMarketProfileId: import.meta.env.VITE_NFT_MARKET_PROFILE_ID || undefined, networkId: releaseNetworkId(import.meta.env.VITE_TAIRA_NETWORK_ID), profileId: import.meta.env.VITE_EXECUTION_PROFILE_ID || undefined, applicationId: import.meta.env.VITE_GAME_APPLICATION_ID || undefined });
}
function savePrefs(): void { try { localStorage.setItem(prefsKey, JSON.stringify({ ...prefs, car: carId, track: trackId, music: audio.musicVolume * 100, effects: audio.effectsVolume * 100 })); } catch { /* Storage is optional for play. */ } }
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string): void {
  const element = document.querySelector<HTMLElement>('#toast')!; element.textContent = message; japaneseInterface(element); element.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 5000);
}
function setView(next: View, shopChapter: number | null = null): void {
  // Leaving the pre-race garage for anywhere but the start line drops the chapter.
  if (view === 'pit' && next !== 'pit' && next !== 'race') storyRun = null;
  if (next !== 'race' || networkRace || spectator) { localScenePreparing = false; scenePreparationError = ''; }
  if (networkRace || spectator) sceneCover.update(null);
  if (view === 'street' && next !== 'street') street.close();
  if (view === 'prove' && next !== 'prove') nativeProof.close();
  if (view === 'soundtrack' && next !== 'soundtrack') { records.close(); audio.setExternalMusic(false); }
  if (next === 'soundtrack') audio.setExternalMusic(true);
  if (next !== 'cutscene') { cutscene.stop(); audio.endCutscene(); }
  if (next !== 'race') audio.stopDrive();
  garage.setStoryChapter(next === 'shop' ? shopChapter : null);
  // Restarting the current drive must not forget keys that are still down.
  if (view !== 'race' || next !== 'race') keys.clear();
  presentation.reset(); previousView = view; view = next; paused = false; controls = 0; touch.clear();
  if (next !== 'room') live.deactivate();
  if (!['room', 'race', 'results', 'cutscene', 'pit'].includes(next)) history.replaceState(null, '', `#/${next === 'home' ? '' : next === 'shop' && shopChapter !== null ? `shop/story/${shopChapter}` : next}`);
  root.dataset.view = view; if (view === 'street') { history.replaceState(null, '', '#/street/tokyo-1986'); street.resize(); } else renderer.resize();
  document.querySelector<HTMLElement>('#race-tools')!.hidden = view !== 'race' || localScenePreparing;
  document.querySelector<HTMLElement>('#touch-controls')!.hidden = view !== 'race' || localScenePreparing || replay !== null || spectator !== null;
  renderScreen(); if (view === 'street') syncStreetTools();
}
/** Practice opponents for the next garage race; only unlocked fields cycle. */
function fieldPicker(): string {
  const field = practiceField(selectedField()), open = PRACTICE_FIELDS.filter(f => garageSave.fields.includes(f.id));
  const label = garageSave.stock ? '全車ノーマル<small lang="en">EQUAL CARS · RaceV1</small>' : `${field.name.ja}<small lang="en">${field.name.en} · PRIZE ×${(field.prize / 100).toFixed(1)}</small>`;
  const arrows = !garageSave.stock && open.length > 1;
  return `<div class="field-picker">${arrows ? '<button data-action="field-prev" aria-label="Previous practice field">←</button>' : '<span></span>'}<div>${label}</div>${arrows ? '<button data-action="field-next" aria-label="Next practice field">→</button>' : '<span></span>'}</div>`;
}
function renderScreen(): void {
  const track = TRACKS[trackId]!, car = LIVERIES[carId]!;
  if (view === 'race' && localScenePreparing) {
    screen.innerHTML = `<div class="pause-panel scene-preparation-panel"><p class="eyebrow">SORA MOTOR CLUB / 出発の準備</p><h1>${scenePreparationError ? '映像を読み込めませんでした。' : 'もうすぐ、走り出せる。'}<small lang="en">${scenePreparationError ? 'THE SCENE DIDN’T LOAD.' : 'PREPARING YOUR DRIVE.'}</small></h1><p>${scenePreparationError ? escape(scenePreparationError) : '車と街並みを読み込んでいます。<br><span lang="en">Loading cars and scenery. Your drive begins when everything is ready.</span>'}</p>${scenePreparationError ? '<button class="primary" data-action="scene-reload">再読み込み <small lang="en">RELOAD PAGE ↻</small></button>' : ''}<button class="text-button" data-action="home">戻る <small lang="en">BACK TO THE CLUB →</small></button></div>`;
    japaneseInterface(screen); return;
  }
  if (view === 'street') { street.render(); return; }
  if (view === 'home') screen.innerHTML = `<div class="hero-copy"><p class="eyebrow"><span class="tiny-flag">天</span> THE JAPANESE ARCADE RACING CLUB</p><h1><span class="hero-glitch">SORA<span class="hero-glitch-layer hero-glitch-red" aria-hidden="true">SORA</span><span class="hero-glitch-layer hero-glitch-cyan" aria-hidden="true">SORA</span></span><br><em>CARS<span class="title-dot">®</span></em></h1><p class="hero-japanese" lang="ja">次のカーブで、会おう。</p><p class="hero-description">8人の仲間。ひとつのゴール。<br>遠回りして、帰ろう。<span class="english-subtitle" lang="en">Eight drivers. One finish line. Take the long way home.</span></p><div class="hero-actions"><button class="primary" id="start-btn" data-action="practice">走り出そう <small lang="en">START YOUR ENGINE ↗</small></button><button class="text-button" data-action="lobby">XORをかけて対戦 <small lang="en">RACE FOR XOR →</small></button></div><p class="hero-hint">無料練習 · ウォレット不要 <span lang="en">FREE PRACTICE</span></p><button class="story-home-link" data-action="story">物語を始める <span lang="en">JAPAN 1986 · STORY MODE →</span></button></div>
    <div class="hero-side"><span lang="ja">走ることが、自由になる。</span><b>JAPAN 1986</b></div>
    <div class="circuit-picker"><span class="micro">TONIGHT’S CIRCUIT / ${String(trackId + 1).padStart(2, '0')}</span><div class="circuit-name"><button data-action="track-prev" aria-label="Previous track">←</button><div><h2>${track.japanese}<small lang="en">${track.name}</small></h2><p>${track.location} <span>· ${(track.length / 1_000_000).toFixed(1)} KM</span></p></div><button data-action="track-next" aria-label="Next track">→</button></div><div class="track-dots">${TRACKS.map(t => `<button data-action="track-${t.id}" class="${t.id === trackId ? 'active' : ''}" aria-label="Select ${t.name}"></button>`).join('')}</div>${fieldPicker()}<button class="street-entry" data-action="street-select">東京 1986・暁の街道 <small lang="en">TOKYO STREET RUN →</small></button></div>
    <div class="edition-stamp"><img src="${flag}" alt="SORA"><span>峠<br><small>STREET SPEC / VOL. 01</small></span></div>`;
  else if (view === 'proofs') proofWorkshop.render();
  else if (view === 'prove') nativeProof.render();
  else if (view === 'shop') garage.render();
  else if (view === 'tuning' || view === 'pit') tuning.render();
  else if (view === 'soundtrack') records.render();
  else if (view === 'story') screen.innerHTML = storyMenu(unlockedChapter);
  else if (view === 'cutscene') { /* CutscenePlayer owns the dialogue scene. */ }
  else if (view === 'garage') screen.innerHTML = `<div class="garage-copy"><p class="eyebrow">THE GARAGE / 六台のマシン</p><h1>自分だけの<br><em>一台に。</em><span class="english-subtitle" lang="en">MAKE IT YOURS.</span></h1><p class="body-copy">色を選んで、部品を組もう。<br><span lang="en">Pick a color, fit your parts. Live XOR races stay equal.</span></p><div class="car-name"><span>${String(car.id + 1).padStart(2, '0')}</span><h2>${car.japanese}<small lang="en">${car.name}</small></h2></div><div class="swatches" aria-label="Car colors">${LIVERIES.map(c => `<button data-action="car-${c.id}" style="--swatch:${c.color}" class="${c.id === carId ? 'active' : ''}" aria-label="Select ${c.name}" aria-pressed="${c.id === carId}"></button>`).join('')}</div>${garageSummary(garageSave)}<button class="primary" data-action="practice">TAKE IT FOR A SPIN <span>↗</span></button><button class="street-entry" data-action="street-select">東京 1986・暁の街道 <small lang="en">TOKYO STREET RUN →</small></button><button class="garage-shop-link" data-action="shop">SORAカスタム工房 <small lang="en">LIVERIES & VISUAL UPGRADES →</small></button></div><div class="garage-caption"><img src="${flag}" alt="SORA flag"><span>SORA MOTOR CLUB<br><b>自分の道を走れ。</b></span></div>`;
  else if (view === 'lobby') {
    screen.innerHTML = `<div class="workspace"><p class="eyebrow">MULTIPLAYER / 対戦</p><div class="section-heading"><h1>今夜のグリッド。<small class="english-subtitle" lang="en">THE GRID.</small></h1><button class="small-button" data-action="refresh">REFRESH ↻</button></div><p class="body-copy">Real drivers. Shared roads. XOR on the finish line.</p><div class="lobby-controls"><label>CIRCUIT<select id="lobby-track">${TRACKS.map(t => `<option value="${t.id}" ${t.id === trackId ? 'selected' : ''}>${t.japanese} / ${t.name}</option>`).join('')}</select></label><label>GRID SIZE<select id="grid-size">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === 8 ? 'selected' : ''}>${n} racers</option>`).join('')}</select></label><label>ENTRY STAKE<input id="stake" type="number" min="1" step="1" value="10"><span class="input-unit">XOR</span></label></div><div id="chain-status" class="network-notice"><span class="status-dot"></span><div><h3>CHECKING THE STARTING LIGHTS</h3><p>Reading native race availability from Taira.</p></div></div><div class="lobby-table"><div class="table-head"><span>RACE</span><span>CIRCUIT</span><span>DRIVERS</span><span>ENTRY STAKE</span></div><div id="lobby-rows" class="empty-state"><span lang="ja">待</span><p>Live races appear here when the network is ready.</p></div></div><div class="lobby-actions"><button class="primary" data-action="create-race" disabled>CREATE A RACE <span>＋</span></button><button class="text-button" data-action="practice">PRACTICE WHILE YOU WAIT →</button></div><p class="fine-print">Testnet XOR · No house fee · Winner takes the pot · Exact ties split it</p></div>`;
    void refreshLobbies();
  } else if (view === 'room') { live.activate(); }
  else if (view === 'history') {
    const history = getHistory(), streetHistory = getStreetHistory();
    screen.innerHTML = `<div class="workspace"><p class="eyebrow">YOUR SESSIONS / 記録</p><div class="section-heading"><h1>走りの記録。<small class="english-subtitle" lang="en">THE RECORD.</small></h1><label class="small-button upload-label">IMPORT REPLAY ↥<input type="file" id="replay-file" accept="application/json,.json" hidden></label></div><p class="body-copy">Every corner, every overtake. Run it back.</p><div class="history-list">${streetHistory.map((r, i) => `<div class="history-row"><span class="history-rank">東<small>京</small></span><div><h3>暁の街道<small lang="en">Tokyo · Road to Dawn</small></h3><p>${new Date(r.savedAt).toLocaleDateString('ja-JP')} · ${formatTime(r.controls.length)} · ローカル記録</p></div><button class="small-button" data-action="street-history-${i}">再計算して再生 <small>VERIFY & REPLAY ↗</small></button><button class="icon-button" data-action="street-download-${i}" aria-label="Export Tokyo replay">↓</button></div>`).join('')}${history.length ? history.map((r, i) => { const s = replayResult(r), you = Math.max(0, r.names.indexOf('YOU')), rank = raceResultPlaces(s).get(you)!; return `<div class="history-row"><span class="history-rank">${String(rank).padStart(2, '0')}<small>/${r.names.length}</small></span><div><h3>${TRACKS[r.trackId]!.japanese}${isGarageReplay(r) ? ' · チューン車' : ''}<small lang="en">${TRACKS[r.trackId]!.name}${isGarageReplay(r) ? ' · TUNED CARS' : ''}</small></h3><p>${new Date(r.savedAt).toLocaleDateString('ja-JP')} · ${r.source.toUpperCase()} · ${formatTime(s.tick)}</p></div><button class="small-button" data-action="replay-${i}">REPLAY ↗</button><button class="icon-button" data-action="export-${i}" aria-label="Export replay">↓</button></div>`; }).join('') : streetHistory.length ? '' : `<div class="empty-state"><span lang="ja">道</span><h3>YOUR STORY STARTS ON THE ROAD.</h3><p>Finish a practice session to save your first replay.</p><button class="text-button" data-action="practice">START DRIVING →</button></div>`}</div></div>`;
  } else if (view === 'settings') screen.innerHTML = `<div class="workspace settings"><p class="eyebrow">PIT WALL / 設定</p><h1>自分の設定。<small class="english-subtitle" lang="en">YOUR SETUP.</small></h1><div class="settings-grid"><section class="picture-settings" data-bilingual><h2>PICTURE / <span lang="ja">映像</span></h2><button type="button" class="small-button picture-toggle" data-action="pixel-finish" aria-pressed="${getPixelFinish()}" aria-describedby="pixel-finish-description"><span>PIXEL FINISH / <span lang="ja">ピクセル仕上げ</span></span><strong aria-hidden="true">${getPixelFinish() ? 'ON' : 'OFF'}</strong></button><p class="fine-print" id="pixel-finish-description">Finishes the detailed 3D race as hand-drawn pixel art: one art grid and the cutscene colour palette. / <span lang="ja">精細な3Dレースを、カットシーンと同じ色の手描きドット絵に仕上げます。</span></p><p class="fine-print picture-credits"><a href="${base}assets/models/sora-ae86/PROVENANCE.md" target="_blank" rel="noopener">Vehicle art credits</a><a href="${base}assets/materials/PROVENANCE.json" target="_blank" rel="noopener">Scanned material credits</a></p></section><section><h2>SOUND SYSTEM</h2><label class="slider-label">MUSIC <output id="music-level">${Math.round(audio.musicVolume * 100)}%</output><input id="music-volume" type="range" min="0" max="100" value="${audio.musicVolume * 100}"></label><label class="slider-label">ENGINE & EFFECTS <output id="effects-level">${Math.round(audio.effectsVolume * 100)}%</output><input id="effects-volume" type="range" min="0" max="100" value="${audio.effectsVolume * 100}"></label><p class="fine-print">25 original 1980s Japanese electronic-inspired songs. Cutscene music follows the story and camera, with analog bass, FM bells and warm synth pads. Listen here or download the MIDI.</p><button class="record-secondary" data-action="soundtrack">SORA RECORDS · 音源と利用許諾 <small lang="en">THE SOUNDTRACK COLLECTION ↗</small></button><div class="music-downloads">${MUSIC_LIBRARY.map((song, i) => `<div class="radio-track"><button class="text-button" data-action="music-track-${i}">${song.japanese}<small lang="en">${song.name} ▶</small></button><a href="${base}assets/music/${song.file}.mid" download aria-label="${song.name} MIDI">MIDI ↓</a></div>`).join('')}</div></section><section><h2>DRIVER CONTROLS</h2><dl class="control-list"><div><dt>ACCELERATE / BRAKE</dt><dd>W / S <span>↑ / ↓</span></dd></div><div><dt>STEER</dt><dd>A / D <span>← / →</span></dd></div><div><dt>DRIFT</dt><dd>SPACE</dd></div><div><dt>BOOST</dt><dd>SHIFT / X</dd></div><div><dt>PAUSE / FULLSCREEN</dt><dd>ESC / F</dd></div><div><dt>GAMEPAD</dt><dd>R2 gas · L2 brake · A boost · B drift</dd></div></dl><p class="fine-print">Touch controls appear on mobile. Gamepads connect automatically.</p></section><section class="network-settings"><h2>NETWORK</h2><label>TORII ENDPOINT<input id="torii-url" type="url" value="${escape(prefs.torii)}"></label><button class="small-button" data-action="save-network">SAVE ENDPOINT →</button><p class="fine-print">Endpoints provide transport. Native Iroha verifies race proofs and settles XOR. This build requires a release-pinned network identity before wallet signing.</p></section></div></div>`;
  else if (view === 'race') screen.innerHTML = spectator ? '<div class="peer-status" id="peer-status">Verifying the public feed…</div><div class="replay-controls"><span>SPECTATING / 観戦</span><button data-action="follow-next">FOLLOW NEXT CAR →</button><button data-action="room">SESSION ↗</button><button data-action="home">EXIT ↗</button></div>' : replay ? `<div class="replay-controls"><span>REPLAY / ${escape(replay.source.toUpperCase())}</span><button data-action="replay-camera">${cameraNames[replayCamera]} · C</button><button data-action="replay-speed">${replaySpeed}×</button><button data-action="home">EXIT ↗</button></div>` : `${networkRace ? '<div class="peer-status" id="peer-status">Connecting to the grid…</div><button class="session-button" data-action="room">SESSION / CONNECTIONS ↗</button>' : ''}<div class="race-start-hint ${currentRace.tick > 120 ? 'faded' : ''}"><span>W / ↑ <b>ACCELERATE</b></span><span>A D / ← → <b>STEER</b></span><span>SPACE <b>DRIFT</b></span><span>SHIFT <b>BOOST</b></span></div>${raceTunes ? '<div class="tune-hud" id="tune-hud" data-bilingual><span data-hud="drift" hidden>ドリフト充電 · DRIFT CHARGE</span><span data-hud="draft" hidden>スリップストリーム · SLIPSTREAM</span></div>' : ''}`;
  else if (view === 'results') {
    const ranking = rankCars(currentRace), places = raceResultPlaces(currentRace), player = currentRace.cars[playerSlot]!, placement = places.get(playerSlot)!;
    const resultLabel = (car: typeof player) => car.finishTick !== null ? formatTime(car.finishTick) : car.dnf ? 'FORFEIT' : currentRace.tick < 5400 ? 'TECHNICAL WIN' : `${Math.max(0, car.progress / 1000).toFixed(1)} m`;
    // A story race reports its chapter objective rather than a practice placing.
    const story = storyResult !== null && !replay && !networkRace ? { chapter: storyResult, cleared: storyObjectiveMet(storyResult, placement, places.get(7)), objective: storyObjective(storyResult) } : null;
    screen.innerHTML = `<div class="results-panel"><p class="eyebrow">${story ? `CH. ${String(story.chapter + 1).padStart(2, '0')} · ${story.cleared ? '章クリア / CHAPTER CLEARED' : '目標未達 / OBJECTIVE MISSED'}` : `${replay ? 'REPLAY COMPLETE' : networkRace ? 'LIVE RACE COMPLETE' : 'PRACTICE COMPLETE'} / お疲れ様でした`}</p><div class="result-title"><span>${String(placement).padStart(2, '0')}<small>/${currentRace.cars.length}</small></span><div><h1>${(story ? story.cleared : placement === 1 && (player.finishTick !== null || !player.dnf)) ? 'いい走りだった。' : 'もう一度、走ろう。'}</h1><p>${TRACKS[currentRace.trackId]!.name} · ${resultLabel(player)}</p>${story ? `<p>目標：${escape(story.objective.ja)} / ${escape(story.objective.en)}</p>` : ''}</div></div>${lastAward && !replay && !networkRace ? prizeBox(lastAward, storyResult !== null) : ''}<div class="results-list">${ranking.map(c => `<div class="result-row ${c.slot === playerSlot ? 'you' : ''}"><span>${String(places.get(c.slot)).padStart(2, '0')}</span><i style="background:${LIVERIES[skins[c.slot] ?? 0]!.color}"></i><strong>${escape(raceNames[c.slot])}</strong><span>${resultLabel(c)}</span></div>`).join('')}</div><div class="result-actions">${story ? storyResultActions(story.chapter, story.cleared) : `<button class="primary" data-action="${networkRace ? 'room' : 'rematch'}">${networkRace ? 'SESSION & SETTLEMENT' : 'RUN IT BACK'} <span>↗</span></button>`}${storyResult !== null ?`<button class="text-button" data-action="story-workshop-${Math.min(unlockedChapter, CHAPTERS.length - 1)}">工房で一息 <span lang="en">VISIT THE WORKSHOP →</span></button>` : ''}<button class="text-button" data-action="watch-last">WATCH REPLAY →</button><button class="text-button" data-action="home">ガレージへ <span lang="en">GARAGE</span></button><button class="text-button" data-action="story">物語へ <span lang="en">STORY →</span></button></div><p class="fine-print">${networkRace ? 'Certified simulation result · XOR settlement still requires an accepted native execution proof.' : replay?.source === 'multiplayer' ? 'Replay of a multiplayer session · This view does not authenticate ledger settlement.' : story ? '物語のレース・XORの預け入れや賞金はありません。 / Story race · No XOR was staked or awarded.' : 'Practice session · No XOR was staked or awarded.'}</p></div>`;
  }
  updateHeader(); japaneseInterface(root);
}
/** Clearing a chapter leads on to the next one; a miss goes straight back to the pre-race garage. */
function storyResultActions(chapter: number, cleared: boolean): string {
  const unlocked = chapter + 1 < CHAPTERS.length && unlockedChapter > chapter;
  if (cleared) return `${unlocked ? `<button class="primary" data-action="chapter-${chapter + 1}">次の章へ / NEXT CHAPTER →</button>` : '<button class="primary" data-action="story">物語へ戻る / BACK TO THE STORY →</button>'}<button class="text-button" data-action="chapter-${chapter}">この章をもう一度 <span lang="en">REPLAY THE CHAPTER →</span></button>`;
  return `<button class="primary" data-action="chapter-retry-${chapter}">もう一度走る / RETRY THE RACE <span>↗</span></button>${unlocked ? `<button class="text-button" data-action="chapter-${chapter + 1}">次の章へ <span lang="en">NEXT CHAPTER →</span></button>` : ''}`;
}
function prizeBox(award: RaceAward, story: boolean): string {
  const parts = [['順位', 'PLACE', award.purse], ['クリーン走行', 'CLEAN RUN', award.clean], ['章クリア', 'CHAPTER CLEAR', award.chapter]].filter(([, , amount]) => amount);
  const unlocked = award.unlocked && practiceField(award.unlocked);
  return `<div class="prize-box"><b>+${yen(award.total)}</b>${parts.map(([ja, en, amount]) => `<span>${ja} ${yen(amount as number)} <small lang="en">${en}</small></span>`).join('')}${unlocked ? `<span class="prize-unlock">新しい相手：${unlocked.name.ja} <small lang="en">NEW FIELD · ${unlocked.name.en}</small></span>` : ''}${story ? `<span class="prize-unlock">所持 ${yen(garageSave.money)}・次の出走前に整備できる <small lang="en">SPEND IT IN THE PRE-RACE GARAGE</small></span>` : `<button class="text-button" data-action="tuning">整備ノートへ <span lang="en">TECH TREE · ${yen(garageSave.money)} →</span></button>`}</div>`;
}
function updateHeader(): void {
  document.querySelector<HTMLButtonElement>('.wallet-button')!.innerHTML = chain.state.account ? `${escape(chain.state.account.slice(0, 7))}…${escape(chain.state.account.slice(-4))} <span>●</span>` : '<span class="ui-bilingual" data-bilingual><span lang="ja">ウォレット接続</span><small lang="en">IROHA CONNECT · TAIRA</small></span><span>↗</span>';
  const sound = document.querySelector<HTMLButtonElement>('.sound-button')!;
  sound.innerHTML = `♫ <span>MUSIC ${audio.musicEnabled ? 'ON' : 'OFF'}</span>`; sound.setAttribute('aria-label', `Turn music ${audio.musicEnabled ? 'off' : 'on'}`);
  document.querySelectorAll<HTMLButtonElement>('.scene-music').forEach(button => {
    button.innerHTML = `♫ 音楽 ${audio.musicEnabled ? 'ON' : 'OFF'} <small lang="en">MUSIC · M</small>`;
    button.setAttribute('aria-pressed', String(audio.musicEnabled));
    button.setAttribute('aria-label', `Turn music ${audio.musicEnabled ? 'off' : 'on'}`);
  });
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach(b => b.classList.toggle('active', b.dataset.action === view || b.dataset.action === 'home' && view === 'lobby' || b.dataset.action === 'garage' && (view === 'shop' || view === 'tuning') || b.dataset.action === 'story' && view === 'pit'));
  japaneseInterface(document.querySelector('.header')!);
}
function chainStateChanged(): void { updateHeader(); japaneseInterface(root); if (view === 'room') live.render(); garage.invalidate(); if (view === 'shop') garage.render(); records.invalidate(); if (view === 'soundtrack') records.render(); }
chain.onState = chainStateChanged;
function startPractice(imported?: LocalReplay): void {
  if (imported) storyRun = null;
  if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) { toast('Leave your live session before starting another drive.'); return; }
  audio.stopDrive();
  storyResult = null;
  controls = 0; lastSoundTick = 0; lastSoundContactTick = -1;
  spectator?.close(); spectator = null;
  networkRace?.stop(); networkRace = null; predictedRace = null;
  replay = imported ?? null; trackId = imported?.trackId ?? trackId; audio.setTrack(trackId);
  raceNames = imported ? [...imported.names] : storyRun !== null ? storyGrid(storyRun) : [...names];
  playerSlot = imported ? Math.max(0, imported.names.indexOf('YOU')) : 6;
  currentRace = createRace(trackId, raceNames.length); skins = imported ? [...imported.skins] : currentRace.cars.map(c => c.slot === playerSlot ? carId : (c.slot + 1) % 6);
  // Garage races tune the player and the rivals; an all-stock grid stays the exact RaceV1 circuit.
  raceField = imported || storyRun !== null ? null : selectedField();
  raceRivals = imported || garageSave.stock ? [] : storyRun !== null ? storyRivals(storyRun, raceNames.length, playerSlot) : fieldRivals(raceField!, raceNames.length, playerSlot);
  const tunes = imported ? isGarageReplay(imported) ? imported.tunes : null : currentRace.cars.map(c => c.slot === playerSlot ? garageTune(garageSave) : raceRivals[c.slot]?.tune ?? STOCK_TUNE);
  raceTunes = tunes?.some(tune => !isStockTune(tune)) ? tunes : null;
  raceStats = { offroad: 0, impacts: 0 }; lastAward = null;
  inputs = []; accumulated = 0; countdown = imported ? -1 : 3; lastCountdown = 4; resultSaved = false;
  // Prepare this selected course at its initial native snapshot. The existing
  // countdown and input handling begin only after a complete frame is drawn.
  localScenePreparing = true; scenePreparationError = '';
  void audio.unlock(); setView('race'); draw();
}
/** Rival drivers read their own tunes; everyone else is the unchanged practice AI. */
function aiControl(slot: number): number {
  const rival = raceRivals[slot];
  return rival ? garageBotControl(currentRace, slot, raceTunes?.[slot] ?? STOCK_TUNE, rival.skill) : botControl(currentRace, slot);
}
function advanceRace(row: readonly number[]): void { if (raceTunes) stepTunedRace(currentRace, row, raceTunes); else stepRace(currentRace, row); }
/** Clean-run bookkeeping and live feedback for drift charging and slipstreams. */
function trackPlayer(energyBefore: number): void {
  const car = currentRace.cars[playerSlot]!, tune = raceTunes?.[playerSlot];
  if (car.finishTick === null && Math.abs(car.x) > 6000) raceStats.offroad++;
  raceStats.impacts += environmentContacts(currentRace).filter(contact => contact.slot === playerSlot && contact.kind !== 'oil').length;
  const hud = document.querySelector<HTMLElement>('#tune-hud');
  if (!hud || !tune) return;
  hud.querySelector<HTMLElement>('[data-hud="drift"]')!.hidden = !(tune.driftCharge && car.energy - energyBefore > tune.boostRecharge);
  hud.querySelector<HTMLElement>('[data-hud="draft"]')!.hidden = !(tune.draft && inWake(currentRace, playerSlot));
}
function chooseTrack(id: number): void {
  trackId = (id + TRACKS.length) % TRACKS.length; currentRace = createRace(trackId, 8); audio.setTrack(trackId); savePrefs(); renderScreen();
}
function playerControls(): number {
  if (view === 'street' ? !street.activeInput : view !== 'race' || paused || replay || spectator) return 0;
  let value = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp') || touch.has('throttle')) value |= C.throttle;
  if (keys.has('KeyS') || keys.has('ArrowDown') || touch.has('brake')) value |= C.brake;
  if (keys.has('KeyA') || keys.has('ArrowLeft') || touch.has('left')) value |= C.left;
  if (keys.has('KeyD') || keys.has('ArrowRight') || touch.has('right')) value |= C.right;
  if (keys.has('Space') || touch.has('drift')) value |= C.drift;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX') || touch.has('boost')) value |= C.boost;
  const pad = navigator.getGamepads?.().find(g => g?.connected);
  gamepadActive = !!pad;
  if (pad) { if (pad.axes[0]! < -0.2) value |= C.left; if (pad.axes[0]! > 0.2) value |= C.right; if (pad.buttons[7]?.pressed) value |= C.throttle; if (pad.buttons[6]?.pressed) value |= C.brake; if (pad.buttons[0]?.pressed) value |= C.boost; if (pad.buttons[1]?.pressed) value |= C.drift; }
  return value;
}
function update(dt: number): void {
  elapsed += dt;
  if (view === 'street') { controls = playerControls(); street.update(dt, controls); return; }
  if (view === 'garage' || ['settings', 'history', 'results', 'story', 'cutscene', 'pit', 'shop', 'tuning', 'proofs', 'prove', 'soundtrack'].includes(view)) return;
  if (view === 'race') {
    if (spectator) { audio.stopDrive(); return; }
    if (networkRace) { updateDrivingSound(playerControls()); return; }
    if (localScenePreparing) { audio.stopDrive(); return; }
    if (paused) { audio.stopDrive(); return; }
    if (countdown > -0.7) {
      countdown -= dt; const cue = Math.ceil(countdown);
      if (cue !== lastCountdown && cue >= 0) { audio.cue(cue === 0 ? 'go' : 'count'); lastCountdown = cue; }
      if (countdown > 0) return;
    }
    accumulated += dt * (replay ? replaySpeed : 1);
    const frameContacts: EnvironmentContact[] = [];
    let stepped = false;
    while (accumulated >= 1 / 30 && view === 'race') {
      accumulated -= 1 / 30;
      let row: number[];
      if (replay) { if (!isGarageReplay(replay)) applyReplayDnf(currentRace, replay); row = replay.inputs[currentRace.tick] ?? []; if (!row.length) { finishSession(); break; } }
      else { controls = playerControls(); row = currentRace.cars.map(c => c.slot === playerSlot ? controls : aiControl(c.slot)); inputs.push(row); }
      const energyBefore = currentRace.cars[playerSlot]!.energy;
      advanceRace(row);
      if (!replay) trackPlayer(energyBefore);
      stepped = true; frameContacts.push(...environmentContacts(currentRace));
      if (raceFinished(currentRace)) { finishSession(); break; }
    }
    if (stepped) setEnvironmentContacts(currentRace, frameContacts);
    if (currentRace.tick > 120) document.querySelector('.race-start-hint')?.classList.add('faded');
    // finishSession can change the view inside the fixed-tick loop. Never restart
    // the engine from the now-finished frame after the results/cutscene silenced it.
    updateDrivingSound(controls);
  } else if (!networkRace && !spectator && view !== 'room') {
    accumulated += dt;
    while (accumulated >= 1 / 30) {
      accumulated -= 1 / 30;
      stepRace(currentRace, currentRace.cars.map(c => botControl(currentRace, c.slot)));
      if (raceFinished(currentRace)) currentRace = createRace(trackId, 8);
    }
  }
}
function draw(): void {
  if (view === 'soundtrack') { sceneCover.update(null); return; }
  if (view === 'race' && localScenePreparing && scenePreparationError) { sceneCover.update(readSceneReadiness(canvas)); return; }
  if (view === 'street') {
    street.draw(elapsed);
    const state = readSceneReadiness(canvas), phase = street.state.phase;
    sceneCover.update(phase === 'loading' || phase === 'error' ? { ...state, status: phase === 'error' ? 'failed' : 'loading' } : state.status === 'ready' ? null : state);
    return;
  }
  if (view === 'proofs') { sceneCover.update(null); proofWorkshop.draw(elapsed); return; }
  if (view === 'cutscene') { sceneCover.update(null); cutscene.draw(elapsed); return; }
  if (view === 'garage') { sceneCover.update(null); renderer.drawShowroom(carId, elapsed, garage.appearance); return; }
  else renderer.draw(presentation.sample(networkRace && predictedRace && view === 'race' ? predictedRace : currentRace, performance.now(), manualClock || paused), { camera: replay ? replayCameras[replayCamera] : 'chase', contacts: environmentContacts(currentRace), playerSlot, names: raceNames, skins, appearances: networkRace ? networkRace.appearances : spectator ? spectator.appearances : replay ? replay.appearances : { [playerSlot]: garage.appearance }, controls: networkRace ? playerControls() : controls, attract: view !== 'race', hud: view === 'race', countdown: view === 'race' && !replay && !networkRace && !spectator ? countdown : undefined, raceMode: spectator ? '観戦 / SPECTATING' : replay ? '再生 / REPLAY' : networkRace ? '対戦 / LIVE' : storyRun !== null ? `物語 / STORY ${storyRun + 1}` : '練習 / PRACTICE' }, elapsed);
  const state = readSceneReadiness(canvas);
  // Asset preparation is presentation-only; an authoritative live race or
  // spectator feed must never be hidden or paused by this local loading gate.
  sceneCover.update(networkRace || spectator || state.status === 'ready' ? null : state);
  const loadingHost = view === 'home' ? screen.querySelector('.hero-copy') : view === 'lobby' ? screen.querySelector('.workspace') : null;
  let loadingNote = screen.querySelector<HTMLElement>('.scene-load-status');
  if (loadingHost && state.status !== 'ready' && !networkRace && !spectator) {
    if (!loadingNote) { loadingNote = document.createElement('p'); loadingNote.className = 'fine-print scene-load-status'; loadingNote.setAttribute('role', 'status'); loadingHost.append(loadingNote); }
    if (loadingNote.textContent !== state.message) loadingNote.textContent = state.message;
  } else loadingNote?.remove();
  root.dataset.scenePreparation = localScenePreparing ? state.status : 'idle';
  if (localScenePreparing && state.status === 'ready') {
    localScenePreparing = false; scenePreparationError = ''; root.dataset.scenePreparation = 'ready';
    document.querySelector<HTMLElement>('#race-tools')!.hidden = false;
    document.querySelector<HTMLElement>('#touch-controls')!.hidden = replay !== null;
    renderScreen();
  } else if (localScenePreparing && state.status === 'failed' && scenePreparationError !== state.message) {
    scenePreparationError = state.message; renderScreen();
  }
}
function updateDrivingSound(input: number): void {
  const car = currentRace.cars[playerSlot]!;
  if (currentRace.tick < lastSoundTick) lastSoundContactTick = -1;
  lastSoundTick = currentRace.tick;
  const active = view === 'race' && !paused && !replay && !spectator && countdown <= 0
    && !car.dnf && car.finishTick === null && !raceFinished(currentRace)
    && (!networkRace || ['racing', 'waiting'].includes(networkRace.status.phase));
  if (!active) { audio.stopDrive(); return; }
  const contact = environmentContacts(currentRace).filter(event => event.slot === playerSlot && event.kind !== 'oil').at(-1);
  const impact = contact && contact.kind !== 'oil' && contact.tick > lastSoundContactTick ? { tick: contact.tick, kind: contact.kind } : undefined;
  if (impact) lastSoundContactTick = impact.tick;
  audio.drive(car.speed, true, !!(input & C.boost) && car.energy >= 25, {
    controls: input, lateral: car.vx, offroad: Math.abs(car.x) > 6000,
    rain: environmentAt(currentRace.trackId, currentRace.tick).rain,
    impact,
  });
}
function finishSession(): void {
  audio.stopDrive();
  if (!replay && !spectator && !resultSaved) {
    const appearances = currentRace.cars.map(c => c.slot === playerSlot ? garage.appearance : { skin: null, upgrade: null });
    const record: LocalReplay = networkRace?.exportReplay() ?? (raceTunes
      ? { version: 1, rules: GARAGE_RULES, baseRulesHash: RACE_RULES_HASH, trackId, names: [...raceNames], skins: [...skins], tunes: raceTunes.map(tune => ({ ...tune })), appearances, inputs: inputs.map(r => [...r]), savedAt: new Date().toISOString(), source: 'practice' }
      : { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId, names: [...raceNames], skins: [...skins], appearances, inputs: inputs.map(r => [...r]), savedAt: new Date().toISOString(), source: 'practice' });
    try { const history = getHistory(); localStorage.setItem(historyKey, JSON.stringify([record, ...history].slice(0, 10))); } catch { toast('Replay storage is full. Export this session from the results.'); }
    resultSaved = true;
  }
  audio.cue('finish');
  // Prize money for local practice and story; never for replays, spectating or live races.
  if (!replay && !networkRace && !spectator && !lastAward) {
    const places = raceResultPlaces(currentRace), place = places.get(playerSlot)!;
    lastAward = raceAward(garageSave, { place, cars: currentRace.cars.length, field: storyRun === null ? raceField ?? 'club' : null, chapter: storyRun ?? undefined,
      objective: storyRun !== null && storyObjectiveMet(storyRun, place, places.get(7)), clean: raceStats.impacts === 0 && raceStats.offroad <= 30 });
    saveGarage(applyAward(garageSave, lastAward, storyRun ?? undefined));
  }
  if (storyRun !== null && !replay && !networkRace && !spectator) {
    const chapter = storyRun, places = raceResultPlaces(currentRace), place = places.get(playerSlot)!;
    const cleared = storyObjectiveMet(chapter, place, places.get(7));
    unlockedChapter = completeStoryChapter(unlockedChapter, chapter, place, places.get(7));
    try { localStorage.setItem(storyKey, JSON.stringify(unlockedChapter)); } catch { /* Offline story remains playable. */ }
    const objective = storyObjective(chapter);
    storyResult = chapter; storyRun = null;
    playCutscene(chapter, cleared ? CHAPTERS[chapter]!.victory : RETRY_SCENE, () => setView('results'), {
      continueLabel: { ja: '結果を見る', en: 'SEE THE RESULTS' },
      status: cleared ? { ja: `${place}位・章クリア`, en: `P${place} · CHAPTER CLEARED` } : { ja: `${place}位・目標は${objective.ja}`, en: `P${place} · NEEDED: ${objective.en}` },
    });
    return;
  }
  setView('results');
}
function playCutscene(chapter: number, lines: readonly Dialogue[], complete: () => void, options?: CutsceneOptions): void {
  setView('cutscene'); void audio.unlock();
  const phase = lines === RETRY_SCENE ? 'retry' : lines === CHAPTERS[chapter]!.victory ? 'victory' : 'intro';
  cutscene.show(CHAPTERS[chapter]!, lines, complete, line => audio.setCutsceneCue(resolveCutsceneCue(chapter, phase, line, resolveStoryShot(lines, line))), options);
  updateHeader();
}
/** Starting a chapter plays its introduction; retrying the race goes straight back to the pre-race garage. */
function startChapter(chapter: number, intro = true): void {
  if (!CHAPTERS[chapter] || chapter > unlockedChapter) throw new Error('前の章をクリアしよう。 / Clear the previous chapter first.');
  if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) throw new Error('ライブ対戦を終了してから物語を始めてください。 / Leave your live race before starting the story.');
  storyRun = chapter; trackId = CHAPTERS[chapter]!.trackId;
  if (intro) playCutscene(chapter, CHAPTERS[chapter]!.intro, () => openPit(chapter), { continueLabel: { ja: '出走前の整備へ', en: 'TO THE PRE-RACE GARAGE' } });
  else openPit(chapter);
}
/** After the chapter's cutscenes, before its race: spend prize money with the crew. */
function openPit(chapter: number): void {
  tuning.select(pitBriefing(chapter, garageSave).pick?.id);
  setView('pit');
}
function getHistory(): LocalReplay[] { return storageRead<unknown[]>(historyKey, []).flatMap(item => { try { return [validateLocalReplay(item)]; } catch { return []; } }); }
function replayResult(r: LocalReplay): RaceState { return localReplayState(r); }
function exportReplay(r: LocalReplay): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(r)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `sora-cars-${r.trackId}-${Date.parse(r.savedAt)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function togglePause(): void {
  if (view === 'street') { touch.clear(); street.action('street-pause'); return; }
  if (view !== 'race' || localScenePreparing) return;
  // Pause gates the output, not physical key state. Keyup still runs while
  // paused, so resuming never needs key repeat or another press to find ↑.
  paused = !paused; controls = 0; touch.clear();
  if (paused) { audio.stopDrive(); screen.innerHTML = `<div class="pause-panel"><p class="eyebrow">TAKE A BREATHER / 休憩</p><h1>IN THE PITS.</h1><button class="primary" data-action="pause">BACK TO THE ROAD <span>↗</span></button><button class="text-button" data-action="rematch">RESTART SESSION</button><button class="text-button" data-action="home">LEAVE RACE</button></div>`; }
  else renderScreen();
  japaneseInterface(screen);
}
async function refreshLobbies(): Promise<void> {
  const state = await chain.probe(); if (view !== 'lobby') return;
  const notice = document.querySelector<HTMLElement>('#chain-status')!;
  notice.innerHTML = `<span class="status-dot ${chain.canStake ? 'ready' : ''}"></span><div><h3>${chain.canStake ? 'STARTING LIGHTS READY' : 'XOR RACING IS NOT LIVE YET'}</h3><p>${escape(state.reason ?? 'Native proof and settlement support are available.')}</p></div>`;
  const create = document.querySelector<HTMLButtonElement>('[data-action="create-race"]'); if (create) create.disabled = !chain.canStake || !chain.state.account;
  japaneseInterface(screen);
  if (chain.canStake) {
    try { const rows = document.querySelector<HTMLElement>('#lobby-rows'); if (rows) await live.list(rows); } catch (e) { toast(japaneseError(e)); }
  }
}
let walletDialogClient: RaceChainClient | null = null, walletDialogGeneration = 0;
const walletHeading = '<p class="eyebrow" lang="en">SORA · IROHA CONNECT · TAIRA TESTNET</p>';
function cancelWalletPairing(): void {
  ++walletDialogGeneration;
  const pending = walletDialogClient; walletDialogClient = null;
  pending?.disconnect();
}
dialog.addEventListener('cancel', cancelWalletPairing);
dialog.addEventListener('close', () => { if (!dialog.open) cancelWalletPairing(); });
async function connectWallet(): Promise<void> {
  if (chain.state.account) { showDialog(`${walletHeading}<h2>CONNECTED WALLET</h2><p class="account-address">${escape(chain.state.account)}</p><p>Connection approved. Purchases and race entries need separate wallet approval.</p><button class="primary" data-action="disconnect">DISCONNECT</button>`); return; }
  showDialog(`${walletHeading}<h2>CONNECT YOUR WALLET.</h2><p id="wallet-message">Preparing a secure wallet connection…</p>`);
  const client = chain, generation = walletDialogGeneration;
  walletDialogClient = client;
  const current = () => walletDialogGeneration === generation && walletDialogClient === client && dialog.open;
  try {
    const session = await client.connect();
    if (!current()) return;
    const qr = await QRCode.toDataURL(session.walletUri, { scale: 4, margin: 4, color: { dark: '#191421', light: '#f2ede4' } });
    if (!current()) return;
    document.querySelector('#dialog-body')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>${walletHeading}<h2>SCAN TO CONNECT.</h2><img class="wallet-qr" src="${qr}" alt="Wallet pairing QR code"><p>Scan with an Iroha Connect wallet set to Taira testnet.</p><a class="primary" href="${escape(session.walletUri)}">OPEN WALLET ↗</a><p class="fine-print">Approve the connection in your wallet. Your keys stay there.</p>`;
    japaneseInterface(dialog);
    await session.waitForApproval;
    if (!current()) return;
    walletDialogClient = null;
    dialog.close(); toast('Wallet connected.'); if (view === 'lobby') await refreshLobbies();
  } catch (error) {
    if (!current()) return;
    const message = japaneseError(error);
    showDialog(`${walletHeading}<h2>CONNECTION UNAVAILABLE.</h2><p>Could not complete the wallet connection. Retry or choose another Taira endpoint in settings.</p><p class="fine-print">${escape(message)}</p><button class="primary" data-action="wallet">TRY AGAIN <span>↻</span></button>`);
  }
}
function showDialog(content: string): void { cancelWalletPairing(); document.querySelector('#dialog-body')!.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button>${content}`; dialog.showModal(); japaneseInterface(dialog); }
async function action(name: string): Promise<void> {
  if (name === 'soundtrack') { setView('soundtrack'); return; }
  if (name === 'street-select') { await startStreet(); return; }
  if (/^street-history-[0-4]$/.test(name)) { const item = getStreetHistory()[Number(name.at(-1))]; if (item) await startStreet(item); return; }
  if (/^street-download-[0-4]$/.test(name)) { const item = getStreetHistory()[Number(name.at(-1))]; if (item) downloadStreetReplay(item); return; }
  if (name.startsWith('street-') && view === 'street') { street.action(name); return; }

  if (name === 'scene-reload' && localScenePreparing && !networkRace && !spectator) {
    location.reload(); return;
  }
  if (name === 'home') {
    if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) { showDialog('<p class="eyebrow">LEAVE LIVE SESSION</p><h2>YOUR GRID IS STILL LIVE.</h2><p>Leaving stops your gameplay connection. Escrow stays on-chain, and a consensus deadline can forfeit a disconnected racer.</p><button class="primary" data-action="leave-live">LEAVE SESSION</button><button class="text-button" data-action="close-dialog">KEEP RACING</button>'); return; }
    spectator?.close(); spectator = null; networkRace?.stop(); networkRace = null; predictedRace = null; replay = null; if (['race', 'results', 'room'].includes(view)) currentRace = createRace(trackId, 8); setView('home');
  }
  else if (name === 'leave-live') { networkRace?.stop(); networkRace = null; predictedRace = null; dialog.close(); await action('home'); }
  else if (name.startsWith('proof-') && view === 'proofs') proofWorkshop.action(name);
  else if (name.startsWith('story-workshop-')) {
    const chapter = storyWorkshopRoute(`shop/story/${name.slice(15)}`, unlockedChapter);
    if (chapter === null) throw new Error('この章の工房はまだ開いていません。 / This chapter is not available yet.');
    if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) throw new Error('ライブ対戦を終了してから工房へ。 / Leave your live race before visiting the workshop.');
    setView('shop', chapter);
  }
  else if (['story', 'garage', 'tuning', 'shop', 'history', 'lobby', 'room', 'settings', 'proofs', 'prove'].includes(name)) setView(name as View);
  else if (name === 'field-prev' || name === 'field-next') {
    const open = PRACTICE_FIELDS.filter(field => garageSave.fields.includes(field.id)), index = open.findIndex(field => field.id === selectedField());
    prefs.field = open[(index + (name === 'field-next' ? 1 : open.length - 1)) % open.length]!.id; savePrefs(); renderScreen();
  }
  else if (name === 'practice' || name === 'rematch') { storyRun = null; startPractice(); }
  else if (name === 'pit-go') { if (view === 'pit' && storyRun !== null) startPractice(); }
  else if (name.startsWith('chapter-retry-')) startChapter(Number(name.slice(14)), false);
  else if (name.startsWith('chapter-')) startChapter(Number(name.slice(8)));
  else if (name === 'scene-next') cutscene.next();
  else if (name === 'scene-back') cutscene.previous();
  else if (name === 'scene-log') cutscene.openLog();
  else if (name === 'scene-log-close') cutscene.closeLog();
  else if (name === 'scene-pause') cutscene.pauseMotion();
  else if (name === 'scene-skip') cutscene.skip();
  else if (name === 'follow-next') { if (spectator) playerSlot = (playerSlot + 1) % currentRace.cars.length; }
  else if (name.startsWith('music-track-')) { const song = Number(name.slice(12)); if (MUSIC_LIBRARY[song]) { audio.setTrack(song); if (!audio.musicEnabled) await audio.toggleMusic(); updateHeader(); toast(`${MUSIC_LIBRARY[song]!.japanese} / ${MUSIC_LIBRARY[song]!.name}`); } }
  else if (name === 'music') { await audio.toggleMusic(); updateHeader(); }
  else if (name === 'wallet') await connectWallet();
  else if (name === 'disconnect') { chain.disconnect(); dialog.close(); }
  else if (name === 'close-dialog') { cancelWalletPairing(); dialog.close(); }
  else if (name === 'track-prev') chooseTrack(trackId - 1);
  else if (name === 'track-next') chooseTrack(trackId + 1);
  else if (name.startsWith('track-')) chooseTrack(Number(name.slice(6)));
  else if (name.startsWith('car-')) { carId = Number(name.slice(4)); savePrefs(); renderScreen(); }
  else if (name === 'pause') togglePause();
  else if (name === 'refresh') await refreshLobbies();
  else if (name === 'create-race') live.createDialog(Number(document.querySelector<HTMLSelectElement>('#lobby-track')!.value), Number(document.querySelector<HTMLSelectElement>('#grid-size')!.value), document.querySelector<HTMLInputElement>('#stake')!.value);
  else if (name === 'watch-last') { const r = getHistory()[0]; if (r) startPractice(r); }
  else if (name === 'replay-camera') { if (replay) { replayCamera = (replayCamera + 1) % replayCameras.length; renderScreen(); } }
  else if (name === 'replay-speed') { replaySpeed = replaySpeed === 1 ? 2 : replaySpeed === 2 ? 4 : 1; renderScreen(); }
  else if (name.startsWith('replay-')) { const r = getHistory()[Number(name.slice(7))]; if (r) startPractice(r); }
  else if (name.startsWith('export-')) { const r = getHistory()[Number(name.slice(7))]; if (r) exportReplay(r); }
  else if (name === 'pixel-finish' && view === 'settings') {
    const enabled = !getPixelFinish();
    setPixelFinish(enabled);
    const button = screen.querySelector<HTMLButtonElement>('[data-action="pixel-finish"]');
    button?.setAttribute('aria-pressed', String(enabled));
    const status = button?.querySelector('strong');
    if (status) status.textContent = enabled ? 'ON' : 'OFF';
  }
  else if (name === 'save-network') {
    const url = document.querySelector<HTMLInputElement>('#torii-url')!.value;
    try { const next = makeChain(url); chain.disconnect(); chain = next; chain.onState = chainStateChanged; prefs.torii = url; savePrefs(); toast('Network endpoint saved.'); } catch (e) { toast(japaneseError(e)); }
  }
}
root.addEventListener('click', e => { const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (target && !target.hasAttribute('disabled')) void action(target.dataset.action!).catch(e => toast(japaneseError(e))); });
// Let the picture button keep native Space activation instead of the driving shortcut.
root.addEventListener('keydown', e => {
  if (e.code === 'Space' && (e.target as HTMLElement).closest('[data-action="pixel-finish"]')) e.stopPropagation();
});
root.addEventListener('input', e => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'proof-beta' && view === 'proofs') proofWorkshop.setBeta(Number(target.value));
  if (['music-volume', 'effects-volume'].includes(target.id)) {
    const music = Number(document.querySelector<HTMLInputElement>('#music-volume')!.value), effects = Number(document.querySelector<HTMLInputElement>('#effects-volume')!.value);
    audio.setVolumes(music / 100, effects / 100); document.querySelector('#music-level')!.textContent = `${music}%`; document.querySelector('#effects-level')!.textContent = `${effects}%`; savePrefs();
  }
});
root.addEventListener('change', e => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'street-seek' && view === 'street') street.seek(Number(target.value));
  if (target.id === 'replay-file' && target.files?.[0]) {
    if (target.files[0].size > 1_048_576) { toast('Replay exceeds the 1 MiB limit.'); return; }
    void target.files[0].text().then(async text => { const raw = JSON.parse(text); if (raw?.type === STREET_REPLAY_TYPE) { if (target.files![0]!.size > MAX_STREET_REPLAY_BYTES) throw new Error('Tokyo replay exceeds its byte limit.'); await startStreet(decodeStreetReplay(text)); } else startPractice(validateLocalReplay(raw)); }).catch(e => toast(japaneseError(e)));
  }
  if (target.id === 'lobby-track') { trackId = Number(target.value); savePrefs(); }
});
document.querySelectorAll<HTMLElement>('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); touch.add(button.dataset.control!); button.classList.add('pressed'); });
  const release = () => { touch.delete(button.dataset.control!); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || dialog.open) return;
  if (view === 'cutscene') {
    if (e.code === 'KeyM' && !cutscene.logOpen) { e.preventDefault(); if (!e.repeat) void action('music'); }
    else cutscene.key(e);
    return;
  }
  if (view === 'proofs') {
    if (['ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); if (!e.repeat) proofWorkshop.action(e.code === 'ArrowRight' ? 'proof-next' : 'proof-prev'); }
    return;
  }
  if ((view === 'race' || view === 'street') && drivingKeys.has(e.code)) {
    // Reserve the whole driving chord, including Shift, for the game.
    e.preventDefault(); keys.add(e.code); return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (view === 'street' && e.code === 'KeyC') { street.action('street-camera'); return; }
    if (view === 'street' && e.code === 'KeyR') { street.action('street-restart'); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (e.code === 'KeyF') { if (document.fullscreenElement) void document.exitFullscreen(); else void root.requestFullscreen(); return; }
    if (e.code === 'KeyC' && replay) { void action('replay-camera'); return; }
    if (e.code === 'KeyM') { void action('music'); return; }
    if (e.code === 'KeyR' && ['race', 'results'].includes(view) && !networkRace && !spectator) { if (view === 'results' && storyResult !== null) startChapter(storyResult, false); else startPractice(); return; }
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); touch.clear(); if (view === 'street') street.suspend(); if (view === 'race' && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (view === 'street') street.suspend();
  keys.clear(); touch.clear();
  if (view === 'race' && !paused) togglePause();
});
function frame(time: number): void {
  const dt = Math.min(0.1, Math.max(0, (time - lastTime) / 1000)); lastTime = time;
  if (!manualClock) update(dt);
  if (time - lastRenderTime >= 1000 / 60 - 0.0001) { draw(); lastRenderTime += Math.max(1, Math.floor((time - lastRenderTime + 0.0001) / (1000 / 60))) * (1000 / 60); }
  requestAnimationFrame(frame);
}
const initialRoute = location.hash.slice(2);
const initialWorkshop = storyWorkshopRoute(initialRoute, unlockedChapter);
setView(initialWorkshop !== null ? 'shop' : ['story', 'garage', 'tuning', 'shop', 'lobby', 'history', 'settings', 'proofs', 'prove', 'soundtrack'].includes(initialRoute) ? initialRoute as View : 'home', initialWorkshop);
if (initialRoute === 'street/tokyo-1986') void startStreet().catch(e => toast(japaneseError(e)));
if (initialRoute.startsWith('session/')) void live.open(decodeURIComponent(initialRoute.slice(8))).catch(e => toast(japaneseError(e)));
window.addEventListener('hashchange', () => {
  const route = location.hash.slice(2);
  const workshop = storyWorkshopRoute(route, unlockedChapter);
  if (route === 'street/tokyo-1986') { if (view !== 'street') void startStreet().catch(e => toast(japaneseError(e))); }
  else if (route.startsWith('session/')) void live.open(decodeURIComponent(route.slice(8))).catch(e => toast(japaneseError(e)));
  else if (workshop !== null) {
    if (networkRace && !['finished', 'stopped'].includes(networkRace.status.phase)) { toast('ライブ対戦を終了してから工房へ。 / Leave your live race before visiting the workshop.'); return; }
    setView('shop', workshop);
  }
  else if (['story', 'garage', 'tuning', 'shop', 'lobby', 'history', 'settings', 'proofs', 'prove', 'soundtrack', ''].includes(route)) setView((route || 'home') as View);
});
requestAnimationFrame(frame);

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    soraCars: { startStreet: () => Promise<void>; finishStreetPractice: () => Promise<void>; state: () => RaceState; startPractice: () => void; setTrack: (id: number) => void; finishPractice: () => void; };
  }
}
window.render_game_to_text = () => JSON.stringify({ mode: view, graphics: { ...readSceneReadiness(canvas), preparing: localScenePreparing || view === 'street' && street.state.phase === 'loading' }, nativeProof: view === 'prove' ? nativeProof.state : null, proofWorkshop: view === 'proofs' ? proofWorkshop.state : null, garage: garage.state, garageTech: { ...tuning.state, raceTuned: raceTunes !== null, raceField, award: lastAward }, soundtrack: records.state, story: { unlockedChapter, activeChapter: storyRun, resultChapter: storyResult, cutscene: view === 'cutscene' ? cutscene.state : null }, paused, replay: !!replay, replayCamera: replay ? replayCameras[replayCamera] : null, spectating: !!spectator, track: TRACKS[trackId]!.name, tick: currentRace.tick, countdown: Math.max(0, countdown), coordinates: 'progress:mm along track; x:mm rightward from road center; speed:mm/tick;30Hz', names: raceNames, playerSlot, player: currentRace.cars[playerSlot], cars: currentRace.cars, position: raceResultPlaces(currentRace).get(playerSlot), controls, gamepadActive, music: audio.musicEnabled, musicState: audio.musicState, drivingSound: audio.driveState, environment: { rain: environmentAt(currentRace.trackId, currentRace.tick).rain, wind: environmentAt(currentRace.trackId, currentRace.tick).wind, contacts: environmentContacts(currentRace), nearby: environmentAt(currentRace.trackId, currentRace.tick).objects.filter(object => Math.abs(object.progress - currentRace.cars[playerSlot]!.progress) < 100000) }, network: chain.state.phase, stakeEnabled: chain.canStake, previousView, street: view === 'street' ? street.state : null, ...(view === 'street' ? { tick: street.state.fullStreetState?.tick ?? 0, track: 'Tokyo · Road to Dawn', replay: street.state.replay, replayCamera: street.state.replay ? street.state.camera : null, playerSlot: street.state.playerSlot, names: street.state.names, coordinates: 'progressMm/lateralMm:mm; speedMmPerTick:mm/tick at30Hz; body/velocity yaw:microturn', position: street.state.fullStreetState?.cars[street.state.playerSlot]?.rank ?? null, player: street.state.fullStreetState?.cars[street.state.playerSlot] ?? null, cars: street.state.fullStreetState?.cars ?? [], paused: street.state.phase === 'paused', countdown: street.state.countdown, environment: null, stakeEnabled: false } : {}) });
window.advanceTime = ms => { manualClock = true; const steps = Math.max(1, Math.ceil(ms / (1000 / 60))); for (let i = 0; i < steps; i++) update(ms / 1000 / steps); draw(); };
window.soraCars = { startStreet: () => startStreet(), finishStreetPractice: () => street.finishPractice(), state: () => copyRace(currentRace), startPractice: () => startPractice(), setTrack: chooseTrack, finishPractice: () => { if (view !== 'race' || replay || networkRace || spectator) return; countdown = -1; while (!raceFinished(currentRace)) { const row = currentRace.cars.map(c => c.slot === playerSlot ? botControl(currentRace, c.slot) : aiControl(c.slot)); inputs.push(row); advanceRace(row); } finishSession(); } };
