import { CHAPTERS, CREW, RIVALS, STORY_CAST, storyObjective, type Bilingual, type Character, type Dialogue, type StoryChapter } from '../game/story';
import { resolveStoryFrame, resolveStorySetting } from '../game/story-scenes';
import { StoryCinema } from '../game/story-cinema';
import { storyWorkshopPanel } from './story-workshop';
import { preloadSpeakerPortraits, speakerPortrait } from './story-portraits';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const base = import.meta.env.BASE_URL;
const number = (n: number) => String(n).padStart(2, '0');
const acts = [
  { ja: 'ラジオが、夜を呼ぶ', en: 'THE NIGHT CALLS' },
  { ja: '消えた灯りの向こうへ', en: 'THROUGH THE BLACKOUT' },
  { ja: '夜明けを、連れて帰れ', en: 'BRING THE DAWN HOME' },
];
function profiles(characters: readonly Character[]): string {
  return characters.map(c => `<article style="--crew-color:${c.color}"><span class="crew-number">${c.number}</span><div><h3>${esc(c.name.ja)} <small lang="en">${esc(c.name.en)}</small></h3><p class="crew-role">${esc(c.role.ja)} <span lang="en">${esc(c.role.en)}</span></p><p>${esc(c.dream.ja)}</p><p class="english-subtitle" lang="en">${esc(c.dream.en)}</p></div></article>`).join('');
}
export function storyMenu(progress: number): string {
  const next = progress < CHAPTERS.length ? progress : 0;
  return `<div class="workspace story-menu"><div class="story-masthead"><img src="${base}assets/sora-retro-sun.png" alt="SORA"><div><p class="eyebrow">SORA MOTOR CLUB · もうひとつの1986</p><h1>この夜を越えて、<br>君と、自由へ。</h1><p class="english-subtitle" lang="en">Through this night. Toward freedom, with you.</p></div></div><p class="body-copy">1986年、ネオンに沸く日本。街の未来を買い占める国際金融組織〈メリディアン評議会〉に、SORAの走り屋たちが挑む。武器は、腕と仲間とSORA X.O.R.。父の工房を守りたいアキ。カセットに本音を録れないレン。恋と自由をかけて走る、全三部・十七章。<span class="english-subtitle" lang="en">Japan, 1986. Beneath the neon boom, the Meridian Council buys control of the future. The SORA racers answer with nerve, friendship and SORA X.O.R. Aki has a garage to save. Ren has a cassette full of things he cannot say. Seventeen chapters of racing, love and freedom.</span></p>
  <button class="primary story-resume" data-action="chapter-${next}">${progress >= CHAPTERS.length ? '最初から、もう一度' : `第${number(next + 1)}章を始める`}<span lang="en">${progress >= CHAPTERS.length ? 'REPLAY THE STORY' : `BEGIN CHAPTER ${number(next + 1)}`} ↗</span></button>
  ${storyWorkshopPanel(Math.min(progress, CHAPTERS.length - 1))}
  ${acts.map((act, index) => { const chapters = [...CHAPTERS.entries()].filter(([, c]) => c.act === index + 1);
    return `<section class="story-act"><header><span>ACT ${number(index + 1)}</span><h2>${act.ja}<small lang="en">${act.en}</small></h2><span>${chapters.filter(([at]) => at < progress).length} / ${chapters.length}</span></header><div class="story-chapters">${chapters.map(([at, chapter]) => `<button class="story-chapter" data-action="chapter-${at}" ${at > progress ? 'disabled' : ''}><img src="${base}assets/story/${chapter.art}" alt="" loading="lazy"><span><small>CH. ${number(at + 1)} · ${at < progress ? 'CLEAR' : at === progress ? 'NEXT' : 'LOCKED'}${chapter.route ? ' · 街道 STREET' : ''}</small><strong>${esc(chapter.title.ja)}</strong><span class="english-subtitle" lang="en">${esc(chapter.title.en)}</span>${at <= progress ? `<span class="chapter-synopsis">${esc(chapter.synopsis.ja)}<span class="english-subtitle" lang="en">${esc(chapter.synopsis.en)}</span></span>` : ''}<span class="chapter-objective">目標：${esc(storyObjective(at).ja)} / ${esc(storyObjective(at).en)}</span><em>${at < progress ? 'もう一度走る / REPLAY ↗' : at === progress ? '物語を始める / BEGIN ↗' : '前の章をクリア / CLEAR PREVIOUS CHAPTER'}</em></span></button>`).join('')}</div></section>`; }).join('')}
  ${progress > 0 ? `<section class="story-dossier"><h2>工房の記録 <small lang="en">THE WORKSHOP FILE</small></h2><p>走った夜と、言えなかったこと。<span lang="en" class="english-subtitle">The nights we raced. The things we could not say.</span></p>${CHAPTERS.filter((_, at) => at < progress).map((c, at) => `<details><summary>${number(at + 1)} · ${esc(c.title.ja)} <small lang="en">${esc(c.title.en)}</small></summary><p>${esc(c.dossier.ja)}</p><p lang="en" class="english-subtitle">${esc(c.dossier.en)}</p></details>`).join('')}</section>` : ''}
  <p class="fine-print">もうひとつの1986年を描く創作です。メリディアン評議会と、作中のSORA X.O.R.端末・取引は架空のもの。対戦は3つのサーキットと5本の1986年の街道を走る無料AIレースで、進行はこの端末に保存されます。物語の進行ではXOR送金やNFT配布は発生しません。工房での実際の購入には、別途ウォレットの承認が必要です。<span lang="en" class="english-subtitle">An alternate-history fiction. The Meridian Council and the story’s 1986 SORA X.O.R. terminals and exchanges are imagined. Play free AI races on three circuits and five 1986 street routes; progress stays on this device. Story progress sends no XOR and grants no NFTs. Actual workshop purchases require separate wallet approval.</span></p>
  <h2 class="crew-heading">SORAの仲間たち <span lang="en">THE CREW</span></h2><div class="crew-roster">${profiles(CREW)}</div><h2 class="crew-heading">交差する道 <span lang="en">CROSSING PATHS</span></h2><div class="crew-roster rival-roster">${profiles(RIVALS)}</div></div>`;
}

/** Where the last line leads, and the race result an aftermath reacts to. */
export interface CutsceneOptions { continueLabel?: Bilingual; status?: Bilingual }

/** Deliberate Japanese dialogue with English subtitles. No simulation or spending authority. */
export class CutscenePlayer {
  #timer: ReturnType<typeof setInterval> | null = null;
  #index = 0;
  #furthest = 0;
  #visible = 0;
  #complete: (() => void) | null = null;
  #lines: readonly Dialogue[] = [];
  #chapter: StoryChapter | null = null;
  #cinema: StoryCinema | null = null;
  #sequence = '';
  #onShot: ((lineIndex: number) => void) | undefined;
  #padHeld = false;
  #motionPaused = false;
  #motionMode = '';
  #skipTimer: ReturnType<typeof setTimeout> | null = null;
  #continueLabel: Bilingual | undefined;
  readonly #reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(readonly screen: HTMLElement) {
    // Clicking or tapping the picture or the dialogue box advances like Next. A pointer
    // click on a control drops its focus, so Enter and Space go back to advancing the dialogue.
    screen.addEventListener('click', event => {
      if (!this.#complete || this.logOpen) return;
      const target = event.target as HTMLElement, button = target.closest('button');
      if (button) { if (event.detail) button.blur(); return; }
      if (target.closest('.cutscene-world, .cutscene-dialogue') && !getSelection()?.toString()) this.next();
    });
  }
  get logOpen(): boolean { return !!this.screen.querySelector<HTMLDialogElement>('.scene-log')?.open; }
  get state() { return { chapter: this.#chapter?.id ?? null, position: this.#chapter ? CHAPTERS.indexOf(this.#chapter) : null, phase: this.#lines === this.#chapter?.intro ? 'intro' : this.#lines === this.#chapter?.victory ? 'victory' : 'retry', line: this.#index, speaker: this.#lines[this.#index]?.speaker ?? null, count: this.#lines.length, revealed: this.#visible, logOpen: this.logOpen, skipArmed: this.#skipTimer !== null, motionPaused: this.#motionPaused || this.#reduced.matches, cinema: this.#cinema?.state ?? null }; }
  show(chapter: StoryChapter, lines: readonly Dialogue[], complete: () => void, onShot?: (lineIndex: number) => void, options: CutsceneOptions = {}): void {
    this.stop(); this.#chapter = chapter; this.#lines = lines; this.#index = 0; this.#furthest = 0; this.#complete = complete; this.#motionPaused = false; this.#motionMode = '';
    this.#continueLabel = options.continueLabel;
    this.#sequence = lines === chapter.intro ? `ch${number(chapter.id + 1)}-intro` : lines === chapter.victory ? `ch${number(chapter.id + 1)}-victory` : 'retry';
    const status = options.status ? `<b class="cutscene-status">${esc(options.status.ja)} <span lang="en">${esc(options.status.en)}</span></b>` : 'SORA MOTOR CLUB / 1986';
    this.screen.innerHTML = `<section class="cutscene" aria-label="${esc(chapter.title.ja)}"><p class="scene-announcer" aria-live="polite"></p><div class="cutscene-world"><canvas class="cutscene-canvas" aria-label="物語の風景 / Story scene"></canvas></div><div class="cutscene-grain"></div><div class="cutscene-top"><span>CH. ${number(CHAPTERS.indexOf(chapter) + 1)} · ${status}</span><div><button class="small-button scene-music" data-action="music" aria-pressed="false" aria-label="Turn music on">♫ 音楽 OFF <small lang="en">MUSIC · M</small></button><button class="small-button" data-action="scene-pause" aria-pressed="false">映像を止める <small lang="en">PAUSE MOTION</small></button><button class="small-button" data-action="scene-skip">スキップ <small lang="en">SKIP →</small></button></div></div><div class="cutscene-location"></div><div class="cutscene-dialogue"></div><dialog class="scene-log" aria-label="会話の記録 / Dialogue log"><header><h2>会話の記録 <small lang="en">DIALOGUE LOG</small></h2><button class="small-button" data-action="scene-log-close">戻る / CLOSE</button></header><ol></ol></dialog></section>`;
    this.#onShot = onShot;
    this.#cinema = new StoryCinema(this.screen.querySelector('canvas')!, lines.map((_, index) => resolveStoryFrame(lines, index, this.#sequence)));
    this.screen.querySelector('.scene-log')!.addEventListener('cancel', e => { e.preventDefault(); this.closeLog(); });
    this.#drawLine();
    this.#timer = setInterval(() => {
      const line = this.#lines[this.#index]; if (!line) return;
      if (!this.logOpen) { this.#visible = this.#reduced.matches ? line.ja.length : Math.min(line.ja.length, this.#visible + 1); this.#text(); }
      const pad = navigator.getGamepads?.().find(p => p?.connected), held = !!(pad?.buttons[0]?.pressed || pad?.buttons[9]?.pressed);
      if (held && !this.#padHeld && !this.logOpen) this.next(); this.#padHeld = held;
    }, 35);
  }
  draw(time: number): void { this.#motionControl(); this.#cinema?.draw(time, this.#reduced.matches, this.#motionPaused || this.logOpen); }
  #motionControl(): void {
    const mode = this.#reduced.matches ? 'still' : this.#motionPaused ? 'paused' : 'running';
    if (mode === this.#motionMode) return;
    this.#motionMode = mode;
    const button = this.screen.querySelector<HTMLButtonElement>('[data-action="scene-pause"]');
    if (!button) return;
    button.disabled = mode === 'still'; button.setAttribute('aria-pressed', String(mode !== 'running'));
    button.innerHTML = mode === 'still' ? '静止画表示 <small lang="en">STILL SCENES</small>' : mode === 'paused' ? '映像を動かす <small lang="en">RESUME MOTION</small>' : '映像を止める <small lang="en">PAUSE MOTION</small>';
  }
  #drawLine(): void {
    const chapter = this.#chapter!, line = this.#lines[this.#index]!, character = STORY_CAST.find(c => c.id === line.speaker)!;
    const shot = resolveStoryFrame(this.#lines, this.#index, this.#sequence), setting = resolveStorySetting(this.#lines, this.#index);
    this.#cinema!.set(shot);
    this.#cinema!.preload(this.#lines.slice(this.#index + 1, this.#index + 5).map((_, offset) => resolveStoryFrame(this.#lines, this.#index + offset + 1, this.#sequence)));
    this.#onShot?.(this.#index);
    const location = this.screen.querySelector('.cutscene-location')!;
    location.innerHTML = `<p>${esc(setting.ja)}</p><span lang="en">${esc(setting.en)}</span><small>${esc(chapter.place.ja)}<span lang="en">${esc(chapter.place.en)}</span></small>`;
    this.#visible = this.#reduced.matches ? line.ja.length : 0;
    this.#furthest = Math.max(this.#furthest, this.#index);
    const panel = this.screen.querySelector<HTMLElement>('.cutscene-dialogue')!;
    panel.style.setProperty('--speaker', character.color);
    // The last line's button says where the scene leads instead of a plain Next.
    const onward = this.#index === this.#lines.length - 1 ? this.#continueLabel : undefined;
    panel.innerHTML = `${speakerPortrait(character)}<div class="cutscene-speaker"><strong>${esc(character.name.ja)}<small lang="en">${esc(character.name.en)}</small></strong><span>${number(this.#index + 1)} / ${number(this.#lines.length)}</span></div><div class="scene-copy" tabindex="0" role="region" aria-label="会話 / Dialogue"><p id="scene-japanese" lang="ja" aria-label="${esc(line.ja)}"></p><p class="scene-subtitle" lang="en">${esc(line.en)}</p></div><nav class="scene-controls" aria-label="会話操作 / Dialogue controls"><button class="text-button" data-action="scene-back" ${this.#index ? '' : 'disabled'}>前へ <span lang="en">BACK</span></button><button class="text-button" data-action="scene-log" aria-haspopup="dialog">記録 <span lang="en">LOG · L</span></button><button class="text-button" data-action="scene-next">${onward ? `${esc(onward.ja)} <span lang="en">${esc(onward.en)} ▶</span>` : '次へ <span lang="en">NEXT · ENTER / A ▶</span>'}</button></nav>`;
    preloadSpeakerPortraits(this.#lines.slice(this.#index + 1, this.#index + 3).map(next => next.speaker));
    this.#announce(`${esc(character.name.ja)}：${esc(line.ja)} <span lang="en">${esc(line.en)}</span>`);
    this.#text();
  }
  /** Screen readers hear each line once, while the visible Japanese types out. */
  #announce(html: string): void { const announcer = this.screen.querySelector('.scene-announcer'); if (announcer) announcer.innerHTML = html; }
  #text(): void { const element = this.screen.querySelector('#scene-japanese'); if (element) element.textContent = this.#lines[this.#index]!.ja.slice(0, this.#visible); }
  next(): void {
    if (!this.#complete || this.logOpen) return;
    this.#armSkip(false);
    const line = this.#lines[this.#index]!;
    if (this.#visible < line.ja.length) { this.#visible = line.ja.length; this.#text(); return; }
    if (++this.#index === this.#lines.length) this.finish(); else this.#drawLine();
  }
  previous(): void { if (!this.#complete || this.logOpen || this.#index === 0) return; this.#armSkip(false); this.#index--; this.#drawLine(); this.#visible = this.#lines[this.#index]!.ja.length; this.#text(); }
  /** Skipping takes a second press within a few seconds, so a stray Escape or tap never discards a scene. */
  skip(): void {
    if (!this.#complete || this.logOpen) return;
    if (this.#skipTimer !== null) this.finish(); else this.#armSkip(true);
  }
  #armSkip(armed: boolean): void {
    if (armed === (this.#skipTimer !== null)) return;
    if (this.#skipTimer !== null) clearTimeout(this.#skipTimer);
    this.#skipTimer = armed ? setTimeout(() => this.#armSkip(false), 4000) : null;
    const button = this.screen.querySelector<HTMLButtonElement>('[data-action="scene-skip"]');
    button?.classList.toggle('armed', armed);
    if (button) button.innerHTML = armed ? 'もう一度でスキップ <small lang="en">PRESS AGAIN TO SKIP</small>' : 'スキップ <small lang="en">SKIP →</small>';
    if (armed) this.#announce('もう一度押すと、この場面をスキップします。 <span lang="en">Press skip again to skip this scene.</span>');
  }
  openLog(): void {
    if (!this.#complete || this.logOpen) return;
    const log = this.screen.querySelector<HTMLDialogElement>('.scene-log')!;
    log.querySelector('ol')!.innerHTML = this.#lines.slice(0, this.#furthest + 1).map((line, i) => `<li><strong>${number(i + 1)} · ${esc(STORY_CAST.find(c => c.id === line.speaker)!.name.ja)}</strong>${line.setting ? `<p class="scene-log-setting" lang="ja">${esc(line.setting.ja)}<span class="english-subtitle" lang="en">${esc(line.setting.en)}</span></p>` : ''}<p>${esc(line.ja)}</p><p class="english-subtitle" lang="en">${esc(line.en)}</p></li>`).join('');
    log.showModal(); log.querySelector('li:last-child')?.scrollIntoView({ block: 'nearest' });
  }
  closeLog(): void { this.screen.querySelector<HTMLDialogElement>('.scene-log')?.close(); }
  pauseMotion(): void {
    if (this.#reduced.matches) return;
    this.#motionPaused = !this.#motionPaused;
    this.#motionControl();
  }
  key(event: KeyboardEvent): void {
    if (this.logOpen) { if (event.code === 'Escape') { event.preventDefault(); this.closeLog(); } return; }
    if (!['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'KeyL', 'KeyP'].includes(event.code)) return;
    event.preventDefault(); if (event.repeat) return;
    if (['Enter', 'Space'].includes(event.code) && (event.target as HTMLElement).closest('button')) { (event.target as HTMLElement).closest('button')!.click(); return; }
    if (event.code === 'Escape') this.skip();
    else if (event.code === 'ArrowLeft') this.previous();
    else if (event.code === 'KeyL') this.openLog();
    else if (event.code === 'KeyP') this.pauseMotion();
    else this.next();
  }
  finish(): void { const complete = this.#complete; this.stop(); complete?.(); }
  stop(): void {
    this.closeLog(); if (this.#timer !== null) clearInterval(this.#timer);
    if (this.#skipTimer !== null) clearTimeout(this.#skipTimer);
    this.#timer = null; this.#skipTimer = null; this.#complete = null; this.#padHeld = false; this.#cinema = null; this.#onShot = undefined;
  }
}
