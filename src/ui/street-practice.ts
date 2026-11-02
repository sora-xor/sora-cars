import './street-practice.css';
import { GameAudio, type DriveDetail } from '../game/audio';
import { STREET_ROUTES, loadStreetRoute, loadStreetRouteMusic, type LoadedStreetRoute } from '../game/street/assets';
import { streetRouteStyle } from '../game/street/routes';
import { StreetRaceSession, type StreetRaceState } from '../game/street/session';
import { StreetRaceRenderer } from '../game/street/renderer';
import { streetPresentation } from '../game/street/presentation';
import { planStreetSoundtrack, streetSongPosition } from '../game/street/soundtrack-clock';
import { STREET_SONG_ENDINGS } from '../game/street/song-endings';
import { streetDriver } from '../game/street/test-driver';
import { decodeStreetReplay, encodeStreetReplay, exportStreetReplay, verifyStreetReplay, StreetReplayPlayback, type StreetReplay } from '../game/street/replay';
import { readSceneReadiness } from './scene-preparation';
import { DriveStreetSession, type DriveStreetState } from '../game/drive/street';
import type { DriveEvent } from '../game/drive/race';
import { DRIVER_SKILLS, DriveAI } from '../game/drive/ai';
import { drivePhysics } from '../game/drive/mode';
import { rivalCar, storyCar, type CarBuild } from '../game/car-builds';

type Phase = 'loading' | 'ready' | 'countdown' | 'driving' | 'paused' | 'results' | 'error';
type Camera = 'chase' | 'bumper' | 'aerial';
interface Options {
  canvas: HTMLCanvasElement; screen: HTMLElement; audio: GameAudio;
  onChange(): void; onSaved(replay: StreetReplay): void; notify(message: string): void; onExit(): void;
  /** A different route was opened from the start panel. */
  onRoute?(routeId: string): void;
  /** A story chapter's race finished (see `open`'s `story`). */
  onStoryResult?(result: StreetStoryResult): void;
  /** The player's car as built in the garage (car-builds.ts); presentation only. None races every car as the factory car. */
  build?(): CarBuild | undefined;
}
/** A story chapter raced on a street route: its heading, goal and grid. */
export interface StreetStory { readonly chapter: number; readonly label: { ja: string; en: string }; readonly objective: { ja: string; en: string }; readonly names: readonly string[] }
export interface StreetStoryResult {
  readonly chapter: number; readonly place: number;
  readonly ranking: readonly { readonly name: string; readonly rank: number; readonly time: string; readonly player: boolean; readonly skin: number }[];
}
/** The street field: two aces, three pros and two club drivers, spread across the road. */
const STREET_FIELD = [DRIVER_SKILLS.club, DRIVER_SKILLS.ace, DRIVER_SKILLS.pro, DRIVER_SKILLS.club, DRIVER_SKILLS.pro, DRIVER_SKILLS.ace, DRIVER_SKILLS.club, DRIVER_SKILLS.pro]
  .map((skill, slot) => ({ ...skill, lane: [0, 0.4, -0.4, 0.8, -0.2, -0.8, 0.2, 0.6][slot]! }));
const crew = ['YOU · 空本アキ', '空井レン', '天羽メイ', '雲野ダイチ', '空木ユイ', '天野ジュン', '空城レイ', 'SORA ゲスト'];
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const seconds = (ticks: number, digits = 2) => {
  const scale = 10 ** digits, rounded = Math.round(ticks / 30 * scale);
  return `${Math.floor(rounded / (60 * scale))}:${(rounded % (60 * scale) / scale).toFixed(digits).padStart(3 + digits, '0')}`;
};
/** A driving-model wreck is status 2; the native draft's status 2 is a forfeit. */
const unfinished = (state: StreetRaceState, status: number) => status === 2 && (state as DriveStreetState).physics === 'drive' ? '大破 / WRECKED' : '未完走 / DNF';
const button = (action: string, ja: string, en: string, primary = false) => `<button class="${primary ? 'primary' : 'small-button'}" data-action="street-${action}">${ja}<small lang="en">${en}</small></button>`;
export function downloadStreetReplay(replay: StreetReplay): void {
  const url = URL.createObjectURL(new Blob([encodeStreetReplay(replay)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `sora-cars-${replay.routeId}-${Date.parse(replay.savedAt)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One main-game panel: no second animation loop, input listeners, or custody. */
export class StreetPractice {
  readonly #options: Options; readonly #renderer: StreetRaceRenderer;
  #loaded?: LoadedStreetRoute; #session?: StreetRaceSession | DriveStreetSession; #playback?: StreetReplayPlayback;
  #ai?: DriveAI;
  /** Driving-model crash events since the last frame, for sparks and flying panels. */
  #events: DriveEvent[] = [];
  #record?: StreetReplay; #song?: HTMLAudioElement; #abort?: AbortController;
  #phase: Phase = 'loading'; #resume: 'countdown' | 'driving' = 'driving';
  #camera: Camera = 'chase'; #routeId = 'tokyo-1986'; #skin = 0;
  #open = false; #generation = 0; #accumulator = 0; #countdown = 3; #input = 0;
  #previous?: StreetRaceState; #impact?: DriveDetail['impact'];
  #progress = 0; #error = ''; #playing = false; #musicBlocked = false; #lastMusic = false;
  #sceneMessage = ''; #visualError = false; #resolveOpen?: () => void;
  #resyncMusic = true;
  #musicWanted = false; #musicRequest = 0;
  /** The music clock: ticks a wreck's fast-forward skipped, seconds on the results screen, the song's pass and target. */
  #musicSkip = 0; #musicAfter = 0; #musicPass = 0; #musicTarget = 0;
  #presentationTopInset = 0;
  #story?: StreetStory;
  constructor(options: Options) { this.#options = options; this.#renderer = new StreetRaceRenderer(options.canvas); }
  get activeInput(): boolean { return this.#open && !this.#playback && ['countdown', 'driving'].includes(this.#phase); }
  get state() {
    return { routeId: this.#routeId, playerSlot: this.#record?.playerSlot ?? 0, names: this.#record?.names ?? this.#names, phase: this.#phase, replay: !!this.#playback, camera: this.#camera,
      story: this.#story ? { chapter: this.#story.chapter } : null,
      fullStreetState: this.#native, nativeValues: this.#playback?.values ?? this.#session?.values ?? null,
      countdown: Math.max(0, this.#countdown), controls: this.#input, progress: this.#progress,
      musicPlaying: !!this.#song && !this.#song.paused, error: this.#error || null,
      soundtrackSeconds: this.#song?.currentTime ?? null, soundtrackTarget: this.#song ? this.#musicTarget : null,
      presentation: this.#loaded && this.#native ? streetPresentation(this.#loaded.bundle.track, this.#native.tick) : null,
      verification: this.#playback ? 'local-reexecution' : null, proofQualified: false,
      replayLength: this.#playback?.length ?? null };
  }
  get #native(): StreetRaceState | null { return this.#playback?.state ?? this.#session?.state ?? null; }
  /** The grid's names: a story chapter's, or the crew's practice grid. */
  get #names(): readonly string[] { return this.#story?.names ?? crew; }
  #completeOpen(): void { const resolve = this.#resolveOpen; this.#resolveOpen = undefined; resolve?.(); }
  #setPhase(phase: Phase): void {
    this.#phase = phase; this.#input = 0; this.#accumulator = 0; this.render(); this.#options.onChange(); this.#syncAudio();
    if (phase === 'ready' || phase === 'error') this.#completeOpen();
  }
  /** `story` races a chapter: no route picker, the chapter's names, and `onStoryResult` at the finish. */
  async open(routeId: string, skin: number, replay?: StreetReplay, story?: StreetStory): Promise<void> {
    this.close(); this.#open = true; this.#routeId = routeId; this.#skin = skin; this.#story = replay ? undefined : story;
    const generation = ++this.#generation, abort = this.#abort = new AbortController(); this.#error = ''; this.#progress = 0;
    this.#sceneMessage = ''; this.#visualError = false;
    // The main draw loop prepares tick zero while loading. Resolve after that
    // actual course frame is ready, or immediately when this opening is closed.
    const prepared = new Promise<void>(resolve => { this.#resolveOpen = resolve; });
    this.#options.audio.setExternalMusic(true); this.#setPhase('loading');
    void (async () => {
      try {
        this.#record = replay ? decodeStreetReplay(encodeStreetReplay(replay)) : undefined;
        this.render();
        const [loaded, musicUrl] = await Promise.all([loadStreetRoute(routeId), loadStreetRouteMusic(routeId)]);
        if (!this.#open || generation !== this.#generation) return;
        this.#loaded = loaded; this.#song = new Audio(musicUrl); this.#song.preload = 'auto';
        if (replay) {
          // Snapshot before yielding: caller mutation cannot change an imported run.
          const verified = await verifyStreetReplay(this.#record!, loaded, { signal: abort.signal,
            onProgress: (at, total) => {
              if (!this.#open || generation !== this.#generation) return;
              const progress = Math.floor(at / total * 100); if (progress !== this.#progress) { this.#progress = progress; this.render(); }
            } });
          if (!this.#open || generation !== this.#generation) return;
          this.#playback = new StreetReplayPlayback(verified);
        } else if (drivePhysics()) {
          const skins = this.#names.map((_, slot) => slot === 0 ? this.#skin : slot % 6);
          this.#session = new DriveStreetSession(loaded.bundle.track, loaded.bundle.objects, loaded.bundle.roster, skins);
          this.#ai = new DriveAI(STREET_FIELD);
        } else this.#session = new StreetRaceSession(loaded.bundle);
        this.#renderer.resize(); this.render();
      } catch (error) {
        if (!this.#open || generation !== this.#generation) return;
        this.#error = error instanceof Error ? error.message : String(error); this.#setPhase('error');
      }
    })();
    return prepared;
  }
  close(): void {
    ++this.#generation; this.#abort?.abort(); this.#open = false;
    this.#completeOpen();
    this.#pauseMusic(); if (this.#song) this.#song.removeAttribute('src'); this.#song = undefined;
    this.#options.audio.stopDrive(); this.#options.audio.setExternalMusic(false);
    this.#loaded = undefined; this.#session = undefined; this.#playback = undefined; this.#record = undefined; this.#ai = undefined;
    this.#previous = undefined; this.#impact = undefined; this.#playing = false; this.#musicBlocked = false; this.#camera = 'chase'; this.#events = [];
    this.#resyncMusic = true; this.#story = undefined;
    this.#musicSkip = 0; this.#musicAfter = 0; this.#musicPass = 0; this.#musicTarget = 0;
  }
  resize(): void { this.#renderer.resize(); this.#measurePresentationInset(); }
  #measurePresentationInset(): void {
    this.#presentationTopInset = this.#playback && this.#phase === 'paused'
      ? Math.max(this.#options.screen.querySelector('.street-playback-pause')?.getBoundingClientRect().bottom ?? 0,
        document.querySelector('#race-tools')?.getBoundingClientRect().bottom ?? 0) + 12 : 0;
  }
  suspend(): void { if (['driving', 'countdown'].includes(this.#phase)) this.action('street-pause'); }
  action(name: string): void {
    this.#musicBlocked = false;
    if (name === 'street-exit') { this.#options.onExit(); return; }
    if (name === 'street-reload' && this.#open && this.#phase === 'error' && this.#visualError && STREET_ROUTES.some(route => route.id === this.#routeId)) {
      // This panel only owns local practice/replay; cached 3D asset failures
      // require a fresh renderer and requests, not another native session.
      window.location.reload(); return;
    }
    if (name === 'street-export' && this.#record) { downloadStreetReplay(this.#record); return; }
    if (name === 'street-replay' && this.#record) { void this.open(this.#routeId, this.#skin, this.#record); return; }
    if (name === 'street-retry') { void this.open(this.#routeId, this.#skin, this.#record); return; }
    if (name === 'street-restart') { void this.open(this.#routeId, this.#skin, undefined, this.#story); return; }
    if (name.startsWith('street-route-') && !this.#playback && !this.#story && ['ready', 'error'].includes(this.#phase)) {
      const route = STREET_ROUTES.find(item => `street-route-${item.id}` === name);
      if (route && route.id !== this.#routeId) { void this.open(route.id, this.#skin); this.#options.onRoute?.(route.id); }
      return;
    }
    if (name.startsWith('street-camera-')) {
      const camera = name.slice(14); if (['chase', 'bumper', 'aerial'].includes(camera)) { this.#camera = camera as Camera; this.render(); } return;
    }
    if (name === 'street-camera') { this.#camera = this.#camera === 'chase' ? 'bumper' : this.#camera === 'bumper' ? 'aerial' : 'chase'; this.render(); return; }
    if (name === 'street-start' && this.#phase === 'ready') {
      this.#resyncMusic = true;
      void this.#options.audio.unlock(); this.#countdown = this.#playback ? 0 : 3;
      this.#setPhase(this.#playback ? 'driving' : 'countdown'); return;
    }
    if (name === 'street-pause') {
      if (this.#phase === 'paused') { this.#resyncMusic = true; void this.#options.audio.unlock(); this.#setPhase(this.#resume); }
      else if (this.#phase === 'countdown' || this.#phase === 'driving') { this.#resume = this.#phase; this.#setPhase('paused'); }
    }
  }
  seek(tick: number): void {
    if (!this.#playback || !Number.isInteger(tick) || tick < 0 || tick > this.#playback.length) return;
    this.#playback.seek(tick); this.#previous = undefined; this.#impact = undefined;
    this.#resyncMusic = true; this.#musicAfter = 0;
    this.#resume = 'driving'; this.#setPhase(tick === this.#playback.length ? 'results' : 'paused');
  }
  update(dt: number, input: number): void {
    if (!this.#open) return;
    try {
      if (this.#phase === 'countdown') {
        const before = Math.ceil(this.#countdown); this.#countdown -= dt;
        if (Math.ceil(this.#countdown) !== before) this.#options.audio.cue(this.#countdown <= 0 ? 'go' : 'count');
        const cue = this.#options.screen.querySelector('#street-countdown'); if (cue) cue.textContent = String(Math.max(1, Math.ceil(this.#countdown)));
        if (this.#countdown <= 0) this.#setPhase('driving');
      }
      // Three seconds after the player's wreck the rest of the field races on to the flag.
      const drive = this.#session instanceof DriveStreetSession && !this.#playback ? this.#session : null, wreck = drive?.race.cars[0];
      if (this.#phase === 'driving' && drive && wreck && wreck.wreckTick >= 0 && drive.race.tick - wreck.wreckTick >= 90) {
        const from = drive.race.tick;
        for (let n = 0; n < 450 && !drive.race.done; n++) { const state = drive.state; drive.step(state.cars.map((_, slot) => slot === 0 ? 0 : this.#bot(state, slot))); }
        // The music keeps presentation time through the fast-forward, so the coda plays out.
        this.#musicSkip += drive.race.tick - from - dt * 30;
        this.#previous = undefined; this.#accumulator = 0;
        if (drive.race.done) this.#finish();
      } else if (this.#phase === 'driving') {
        this.#input = this.#playback ? 0 : input; this.#accumulator += dt;
        while (this.#accumulator >= 1 / 30 && this.#phase === 'driving') {
          this.#accumulator -= 1 / 30; this.#previous = this.#native!;
          const state = this.#playback ? this.#playback.step() : this.#session!.step(this.#previous.cars.map((_, slot) => slot === 0 ? input : this.#bot(this.#previous!, slot)));
          const struck = this.#loaded!.bundle.objects.find((object, index) => object.kind !== 'oil' && Math.floor(state.cars[0]!.propHitMask / 2 ** index) % 2 === 1);
          if (struck) this.#impact = { tick: state.tick, kind: struck.kind === 'tree_planter' ? 'tree' : 'sign' };
          // Driving-model contacts: a heavy thud for a big hit or a planter, a clang for a knock.
          const race = this.#playback?.race ?? (this.#session instanceof DriveStreetSession ? this.#session.race : null);
          const hit = race?.events.filter(event => event.slot === 0 && (event.kind === 'wall' || event.kind === 'car' || event.kind === 'prop'))
            .reduce<{ strength: number; heavy: boolean } | null>((best, event) => !best || event.strength > best.strength
              ? { strength: event.strength, heavy: event.strength > 9 || event.kind === 'prop' && race.props[event.other]?.kind === 'planter' } : best, null);
          if (hit && hit.strength > 1.5) this.#impact = { tick: state.tick, kind: hit.heavy ? 'tree' : 'sign' };
          if (race && this.#events.length < 400) this.#events.push(...race.events);
          if (state.done) this.#finish();
        }
        const slider = this.#options.screen.querySelector<HTMLInputElement>('#street-seek'); if (slider) slider.value = String(this.#native!.tick);
        const counter = this.#options.screen.querySelector('#street-time'); if (counter) counter.textContent = seconds(this.#native!.tick);
      }
      if (this.#phase === 'results') this.#musicAfter += dt;
      this.#syncAudio();
    } catch (error) { this.#error = String(error); this.#setPhase('error'); }
  }
  /** Bot controls: the driving model's AI, or the native draft's test driver. */
  #bot(state: StreetRaceState, slot: number): number {
    return this.#session instanceof DriveStreetSession ? this.#ai!.control(this.#session.race, slot) : streetDriver(this.#loaded!.bundle.track, state, slot);
  }
  #finish(): void {
    this.#setPhase('results');
    if (!this.#playback && !this.#record) {
      const names = [...this.#names];
      this.#record = exportStreetReplay(this.#session!, this.#loaded!, { playerSlot: 0, names,
        skins: names.map((_, slot) => slot === 0 ? this.#skin : slot % 6), savedAt: new Date().toISOString() });
      this.#options.onSaved(this.#record); this.#options.audio.cue('finish'); this.render();
      const state = this.#session!.state, story = this.#story, skins = this.#record.skins;
      if (story) {
        const result: StreetStoryResult = { chapter: story.chapter, place: state.cars[0]!.rank,
          ranking: state.cars.map((car, slot) => ({ name: names[slot]!, rank: car.rank, player: slot === 0, skin: skins[slot] ?? 0,
            time: car.status === 1 ? seconds(car.finishTick - 1 + car.finishNumerator / car.finishDenominator, 3) : unfinished(state, car.status) }))
            .sort((a, b) => a.rank - b.rank) };
        // The story then leaves this view (closing the session), so let the current step unwind first.
        const generation = this.#generation;
        setTimeout(() => { if (generation === this.#generation) this.#options.onStoryResult?.(result); }, 0);
      }
    }
  }
  /** Seconds from the start line to the end of the player's race (the line, a wreck or the time limit), once it has ended. */
  #raceEndSeconds(state: StreetRaceState): number | null {
    const slot = this.#record?.playerSlot ?? 0, car = state.cars[slot];
    if (car?.status === 1) return (car.finishTick - 1 + (car.finishDenominator > 0 ? car.finishNumerator / car.finishDenominator : 1)) / 30;
    const race = this.#playback?.race ?? (this.#session instanceof DriveStreetSession ? this.#session.race : null);
    const wreck = car?.status === 2 ? race?.cars[slot]?.wreckTick ?? -1 : -1;
    return wreck >= 0 ? wreck / 30 : state.done ? state.tick / 30 : null;
  }
  #pauseMusic(): void {
    this.#musicWanted = false;
    if (this.#playing) { ++this.#musicRequest; this.#playing = false; }
    this.#song?.pause();
  }
  #syncAudio(): void {
    const audio = this.#options.audio, state = this.#native;
    const active = this.#open && this.#phase === 'driving';
    if (active && state && !this.#playback && state.cars[0]!.status === 0 && !state.done) {
      const car = state.cars[0]!;
      const slip = ((car.bodyYawMicroturn - car.velocityYawMicroturn + 1500000) % 1000000) - 500000;
      audio.drive(car.speedMmPerTick, true, car.boosting === 1, { controls: this.#input, lateral: Math.trunc(slip / 100),
        rain: state.rain, offroad: car.wallContact === 1, ...(this.#impact ? { impact: this.#impact } : {}) });
    } else audio.stopDrive();
    this.#impact = undefined;
    if (!this.#song) return;
    this.#song.volume = audio.musicVolume;
    if (this.#lastMusic !== audio.musicEnabled) {
      this.#musicBlocked = false; this.#lastMusic = audio.musicEnabled;
      if (audio.musicEnabled) this.#resyncMusic = true;
    }
    const clock = { tick: (state?.tick ?? 0) - this.#musicSkip, durationSeconds: this.#loaded!.descriptor.musicDurationSeconds,
      raceEndSeconds: state ? this.#raceEndSeconds(state) : null, afterSeconds: this.#musicAfter, ending: STREET_SONG_ENDINGS[this.#routeId] };
    // The song's restart and its coda rewind an ended file even after a stalled frame.
    const pass = streetSongPosition(clock).pass;
    if (pass !== this.#musicPass) { this.#musicPass = pass; this.#resyncMusic = true; }
    // The coda plays on over the results screen.
    const plan = planStreetSoundtrack({ ...clock,
      currentTime: this.#song.currentTime, mediaDuration: this.#song.duration,
      readyState: this.#song.readyState, seeking: this.#song.seeking, ended: this.#song.ended,
      paused: this.#song.paused, active: active || this.#open && this.#phase === 'results', enabled: audio.musicEnabled, resyncEnded: this.#resyncMusic });
    this.#musicTarget = plan.expectedSeconds;
    if (plan.seekTo !== null) {
      try { this.#song.currentTime = plan.seekTo; this.#resyncMusic = false; }
      // Metadata or seekability may change between planning and assignment.
      // The next normal frame retries; there is no alternate media source.
      catch { this.#pauseMusic(); return; }
    } else if (plan.shouldPlay) this.#resyncMusic = false;
    if (!plan.shouldPlay) { this.#pauseMusic(); return; }
    this.#musicWanted = true;
    if (this.#song.paused && !this.#playing && !this.#musicBlocked) {
      const song = this.#song, generation = this.#generation, request = ++this.#musicRequest; this.#playing = true;
      void song.play().then(() => { if (generation !== this.#generation || !this.#musicWanted) song.pause(); })
        .catch(error => {
          if (generation === this.#generation && request === this.#musicRequest && this.#musicWanted
            && !(error instanceof DOMException && error.name === 'AbortError')) {
            this.#musicBlocked = true; this.#options.notify('音楽ボタンで再開できます。 / Tap music to enable the soundtrack.');
          }
        })
        .finally(() => { if (generation === this.#generation && request === this.#musicRequest) this.#playing = false; });
    }
  }
  draw(time: number): void {
    if (!this.#open || this.#phase === 'error') return;
    const state = this.#native;
    if (!state || !this.#loaded) { const ctx = this.#options.canvas.getContext('2d')!; ctx.fillStyle = '#160f24'; ctx.fillRect(0, 0, this.#options.canvas.width, this.#options.canvas.height); return; }
    const names = this.#record?.names ?? this.#names, skins = this.#record?.skins ?? names.map((_, slot) => slot === 0 ? this.#skin : slot % 6);
    const playerSlot = this.#record?.playerSlot ?? 0, player = this.#options.build?.();
    // Each driver's car: the player's build, the story's drivers' own, and period cars for the host clubs.
    const builds = player ? names.map((name, slot) => slot === playerSlot ? player : storyCar(name) ?? rivalCar(slot * 7919 + 17, 0.4)) : undefined;
    const alpha = this.#phase === 'driving' ? Math.min(1, this.#accumulator * 30) : 1;
    const cars = state.cars.map((car, slot) => {
      const before = this.#previous?.cars[slot]; const mix = (a: number, b: number) => a + (b - a) * alpha;
      const yaw = (a: number, b: number) => a + (((b - a + 1500000) % 1000000) - 500000) * alpha;
      return { ...car, skin: skins[slot]!, ...(before ? { progressMm: mix(before.progressMm, car.progressMm), lateralMm: mix(before.lateralMm, car.lateralMm),
        bodyYawMicroturn: yaw(before.bodyYawMicroturn, car.bodyYawMicroturn), velocityYawMicroturn: yaw(before.velocityYawMicroturn, car.velocityYawMicroturn) } : {}) };
    });
    try {
      this.#renderer.draw(this.#loaded.bundle.track, { ...state, cars }, { playerSlot, builds,
      names: [...names], controls: this.#input, paused: this.#phase !== 'driving' && this.#phase !== 'countdown', bottomInset: matchMedia('(pointer: coarse)').matches && !this.#playback ? 110 : this.#playback ? 75 : 0, hud: ['driving', 'countdown'].includes(this.#phase), camera: this.#camera,
      presentationTitles: ['driving', 'countdown'].includes(this.#phase) || !!this.#playback && this.#phase === 'paused',
      presentationTopInset: this.#presentationTopInset,
      rain: state.rain, objects: this.#loaded.bundle.objects, events: this.#events, raceMode: this.#playback ? '再生 / REPLAY' : this.#story ? '物語 / STORY' : '練習 / PRACTICE' }, time);
      this.#events = [];
      const scene = readSceneReadiness(this.#options.canvas);
      if (scene.status === 'failed') {
        this.#visualError = true; this.#error = scene.message; this.#setPhase('error');
      } else if (this.#phase === 'loading') {
        if (scene.status === 'ready') this.#setPhase('ready');
        else if (scene.message !== this.#sceneMessage) { this.#sceneMessage = scene.message; this.render(); }
      }
    } catch (error) {
      this.#visualError = true; this.#error = error instanceof Error ? error.message : String(error); this.#setPhase('error');
    }
  }
  render(): void {
    if (!this.#open) return;
    const { screen } = this.#options, state = this.#native;
    const style = streetRouteStyle(this.#routeId), place = style.place;
    const heading = `<p class="eyebrow">SORA MOTOR CLUB · ${esc(place.en)} 1986</p>`;
    const descriptor = STREET_ROUTES.find(route => route.id === this.#routeId);
    const songSeconds = Math.round(descriptor?.musicDurationSeconds ?? 0);
    const songLength = `${Math.floor(songSeconds / 60)}:${String(songSeconds % 60).padStart(2, '0')}`;
    const story = this.#story;
    const routes = STREET_ROUTES.length > 1 && !this.#playback && !story ? `<div class="street-routes" role="group" aria-label="コース / Route">${STREET_ROUTES.map(route =>
      `<button data-action="street-route-${route.id}" aria-pressed="${route.id === this.#routeId}">${esc(streetRouteStyle(route.id).place.ja)}<small lang="en">${esc(streetRouteStyle(route.id).place.en)}</small></button>`).join('')}</div>` : '';
    const exit = button('exit', '街を出る', 'EXIT');
    let html = '';
    if (this.#phase === 'loading') html = `<div class="street-panel">${heading}<h1>${this.#record && !state ? '走りを確かめる。' : `${esc(place.ja)}へ。`}</h1><p lang="en">${state ? esc(this.#sceneMessage || 'Preparing the cars, streets and lighting…') : this.#record ? 'Recomputing every recorded input…' : 'Loading the course and soundtrack…'}</p>${this.#record && !state ? `<progress value="${this.#progress}" max="100"></progress><p>${this.#progress}% · 最大約1分 / Up to about a minute</p>` : ''}${exit}</div>`;
    if (this.#phase === 'error') html = `<div class="street-panel">${heading}<h1>読込を停止しました。</h1><p lang="en">${this.#visualError ? 'The 3D scene could not finish loading.' : 'The course or replay could not be verified.'}</p><p class="street-error">${esc(this.#error)}</p>${this.#visualError ? button('reload', 'ページを再読込', 'RELOAD PAGE') : button('retry', '再試行', 'RETRY') + button('restart', '新しく走る', 'NEW RUN')}${routes}${exit}</div>`;
    if (this.#phase === 'ready') html = `<div class="street-panel">${heading}${routes}${story ? `<p class="street-story">${esc(story.label.ja)}　目標：${esc(story.objective.ja)}<small lang="en">${esc(story.label.en)} · GOAL: ${esc(story.objective.en)}</small></p>` : ''}<h1>${esc(style.title.ja)}</h1><p class="street-subtitle" lang="en">${esc(style.title.en)}</p><p>${esc(style.path.ja)}<br><span lang="en">${esc(style.path.en)}</span></p><p>${esc(style.facts.ja)}<br><span lang="en">${esc(style.facts.en)}</span></p><p class="street-song">♪ ${esc(style.song)} <small>${songLength} · ORIGINAL SOUNDTRACK</small></p><p>減速して旋回。SPACEで車体を滑らせ、出口で加速。<br><span lang="en">Brake before corners. Hold SPACE to slide; accelerate on exit.</span></p>${this.#playback ? '<p>再計算済み・ローカル記録 / Locally recomputed replay</p>' : ''}<div class="street-actions">${button('start', this.#playback ? '再生する' : '走り出そう', this.#playback ? 'PLAY REPLAY' : 'START YOUR ENGINE', true)}${exit}</div><p class="fine-print">${story ? '物語の街道レース・同じ車で走り、賞金とXORの授受なし / Story street race · Equal cars, no prize money or XOR' : '無料練習・XORの授受なし / Free practice · No XOR awarded'}<br>${esc(style.provisional.ja)} / ${esc(style.provisional.en)}</p></div>`;
    if (this.#phase === 'countdown') html = `<div class="street-count"><strong id="street-countdown">3</strong><span>${esc(place.ja)}、出発。 / ${esc(place.en)}, LET’S GO.</span></div>`;
    if (this.#phase === 'paused' && this.#playback) html = `<div class="street-playback-pause"><span>一時停止 / PAUSED</span>${button('pause', 'つづける', 'RESUME')}${exit}</div>`;
    if (this.#phase === 'paused' && !this.#playback) html = `<div class="street-panel">${heading}<h1>ひと息つこう。</h1><p lang="en">TAKE A BREATHER.</p><div class="street-actions">${button('pause', 'つづける', 'RESUME', true)}${button('restart', '走り直す', 'NEW RUN')}${exit}</div></div>`;
    if (this.#phase === 'results' && state) {
      const names = this.#record?.names ?? this.#names;
      html = `<div class="street-panel street-results">${heading}<h1>${esc(style.finish.ja)}</h1><p lang="en">${esc(style.finish.en)}</p><div class="street-ranking">${state.cars.map((car, slot) => ({ car, slot })).sort((a, b) => a.car.rank - b.car.rank).map(({ car, slot }) => `<div><b>${car.rank}</b><span>${esc(names[slot])}</span><span>${car.status === 1 ? seconds(car.finishTick - 1 + car.finishNumerator / car.finishDenominator, 3) : unfinished(state, car.status)}</span></div>`).join('')}</div><div class="street-actions">${button('restart', 'もう一度', 'NEW RUN', true)}${this.#record ? button('replay', '走りを再生', 'VERIFY & REPLAY') + button('export', '保存', 'DOWNLOAD') : ''}${exit}</div><p class="fine-print">無料練習の記録・XORの授受なし / Local practice · No XOR awarded</p></div>`;
    }
    if (this.#playback && !['ready', 'loading', 'error'].includes(this.#phase)) html += `<div class="street-replay-bar"><span>再生 / REPLAY · <b id="street-time">${seconds(this.#playback.tick)}</b></span><input aria-label="Replay time" type="range" id="street-seek" min="0" max="${this.#playback.length}" value="${this.#playback.tick}"><div>${(['chase', 'bumper', 'aerial'] as const).map((camera, i) => `<button data-action="street-camera-${camera}" aria-pressed="${this.#camera === camera}">${['追走', '路面', '上空'][i]}<small>${camera.toUpperCase()}</small></button>`).join('')}</div></div>`;
    screen.innerHTML = html;
    this.#measurePresentationInset();
  }
  /** Explicit automation counterpart; all eight bots emit ordinary controls. */
  async finishPractice(): Promise<void> {
    if (!this.#session || this.#playback || !this.#loaded || !this.#open) return;
    const generation = this.#generation; this.#setPhase('paused');
    while (!this.#session.state.done) {
      const state = this.#session.state; this.#session.step(state.cars.map((_, slot) => this.#bot(state, slot)));
      if (this.#session.state.tick % 30 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); if (generation !== this.#generation) return; }
    }
    this.#previous = undefined; this.#finish();
  }
}
