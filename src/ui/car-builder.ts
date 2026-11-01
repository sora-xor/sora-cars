import {
  BODIES, EXHAUSTS, FENDERS, FRONT_AERO, LAMPS, LOWER_TONES, MIRRORS, OPTION_NAMES, PAINTS, SPOILERS, STANCES, STRIPES, STRIPE_COLOURS, STRIPE_HEX,
  WHEEL_COLOURS, WHEEL_HEX, WHEEL_STYLES, LOWER_COLOURS, bodyInfo, paintInfo, rivalCar, stockBuild, validateCarBuild, type CarBuild,
} from '../game/car-builds';
import { CarViewer } from './car-viewer';

/**
 * カスタム工房 / BUILD YOUR CAR (#/custom): pick a 1986 body and dress it, its paint, stripes, wheels, aero, stance and
 * extras, on a turntable drawn like the race. Builds are looks only; the tech tree sells performance, and live races show
 * builds to every racer and spectator while racing equal cars.
 */
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const both = (name: { ja: string; en: string }) => `${esc(name.ja)}<small lang="en">${esc(name.en)}</small>`;
type Tab = 'body' | 'paint' | 'wheels' | 'aero' | 'stance' | 'extras';
const TABS: readonly { id: Tab; name: { ja: string; en: string } }[] = [
  { id: 'body', name: { ja: '車種', en: 'BODY' } }, { id: 'paint', name: { ja: '塗装', en: 'PAINT' } }, { id: 'wheels', name: { ja: 'ホイール', en: 'WHEELS' } },
  { id: 'aero', name: { ja: 'エアロ', en: 'AERO' } }, { id: 'stance', name: { ja: '足回り', en: 'STANCE' } }, { id: 'extras', name: { ja: '小物', en: 'EXTRAS' } },
];
export interface CarBuilderHost {
  readonly screen: HTMLElement;
  active(): boolean;
  build(): CarBuild;
  commit(build: CarBuild): void;
}

export class CarBuilder {
  #tab: Tab = 'body';
  readonly #viewer: CarViewer;
  constructor(private readonly host: CarBuilderHost) {
    this.#viewer = new CarViewer(() => host.active() || !!document.querySelector('[data-view="garage"] canvas[data-car-view]'),
      loading => document.querySelectorAll<HTMLElement>('.car-view-loading').forEach(element => { element.hidden = !loading; }));
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-build]');
      if (target && !target.hasAttribute('disabled')) this.action(target.dataset.build!);
    });
  }

  /** The garage page's turntable: draw the player's car in whatever `root` shows. */
  attachViewer(root: ParentNode): void { this.#viewer.attach(root, this.host.build()); }

  render(): void {
    if (!this.host.active()) return;
    const build = this.host.build(), body = bodyInfo(build.body), paint = paintInfo(build.paint);
    this.host.screen.innerHTML = `<div class="car-builder workspace"><div class="section-heading"><div><p class="eyebrow">SORA CUSTOM GARAGE / 1986</p>`
      + `<h1>一台を、組み上げる。<small class="english-subtitle" lang="en">BUILD YOUR CAR.</small></h1></div>`
      + `<button class="small-button" data-action="garage">${both({ ja: '愛車へ戻る', en: 'BACK TO YOUR CAR' })}</button></div>`
      + `<div class="builder-layout"><section class="builder-stage"><canvas class="car-view" data-car-view aria-label="${esc(body.name.en)} — ${esc(paint.name.en)}"></canvas>`
      + `<p class="car-view-loading" hidden>${both({ ja: '組み立て中…', en: 'BUILDING…' })}</p>`
      + `<div class="builder-plate"><h2>${both(body.name)}</h2><p class="builder-kind">${both(body.kind)}</p><p class="builder-blurb">${esc(body.blurb.ja)}<span lang="en">${esc(body.blurb.en)}</span></p>`
      + `<p class="fine-print">${both({ ja: '見た目だけの改造です。性能は整備ノートで。XOR対戦でも見た目は相手に届き、性能はみんな同じです。', en: 'Looks only: performance comes from the tech tree. Live XOR races show your build and stay equal.' })}</p></div></section>`
      + `<section class="builder-options"><nav class="builder-tabs" aria-label="Build sections">${TABS.map(tab => `<button data-build="tab:${tab.id}" aria-pressed="${tab.id === this.#tab}" class="${tab.id === this.#tab ? 'active' : ''}">${both(tab.name)}</button>`).join('')}</nav>`
      + `<div class="builder-panel">${this.#panel(build)}</div>`
      + `<div class="builder-actions"><button class="small-button" data-build="random">${both({ ja: 'おまかせ', en: 'SURPRISE ME' })}</button>`
      + `<button class="small-button" data-build="factory">${both({ ja: '純正に戻す', en: 'BACK TO FACTORY' })}</button>`
      + `<button class="primary" data-action="practice">走りに行く <span>↗</span></button></div></section></div></div>`;
    this.#viewer.attach(this.host.screen, build);
  }

  #panel(build: CarBuild): string {
    const chips = <K extends keyof CarBuild>(key: K, values: readonly string[], swatch?: (value: string) => string) =>
      `<div class="build-chips">${values.map(value => {
        const name = (OPTION_NAMES as unknown as Record<string, Record<string, { ja: string; en: string }>>)[key]?.[value] ?? { ja: value, en: value };
        const pressed = String(build[key]) === value, colour = swatch?.(value);
        return `<button class="build-chip${colour ? ' with-swatch' : ''}" data-build="set:${key}:${value}" aria-pressed="${pressed}">${colour ? `<i style="--swatch:${colour}"></i>` : ''}${both(name)}</button>`;
      }).join('')}</div>`;
    const group = (title: { ja: string; en: string }, body: string) => `<div class="build-group"><h3>${both(title)}</h3>${body}</div>`;
    if (this.#tab === 'body') {
      return `<div class="build-bodies">${BODIES.map(body => `<button class="build-body" data-build="set:body:${body.id}" aria-pressed="${build.body === body.id}"><b>${both(body.name)}</b><span>${both(body.kind)}</span></button>`).join('')}</div>`;
    }
    if (this.#tab === 'paint') {
      return group({ ja: 'ボディカラー', en: 'BODY COLOUR' }, `<div class="build-paints">${PAINTS.map(paint => `<button class="build-paint" data-build="set:paint:${paint.id}" aria-pressed="${build.paint === paint.id}" style="--swatch:${paint.color}" title="${esc(paint.name.ja)} / ${esc(paint.name.en)}"><i></i><span>${both(paint.name)}${paint.finish !== 'solid' ? `<em>${paint.finish === 'pearl' ? 'PEARL' : 'METALLIC'}</em>` : ''}</span></button>`).join('')}</div>`)
        + group({ ja: 'ツートン', en: 'TWO-TONE' }, chips('lower', LOWER_TONES, value => value === 'stock' || value === 'body' ? '' : LOWER_COLOURS[value as keyof typeof LOWER_COLOURS]))
        + group({ ja: 'ストライプ', en: 'STRIPES' }, chips('stripe', STRIPES))
        + (build.stripe === 'none' ? '' : group({ ja: 'ストライプの色', en: 'STRIPE COLOUR' }, chips('stripeColour', STRIPE_COLOURS, value => STRIPE_HEX[value as keyof typeof STRIPE_HEX])));
    }
    if (this.#tab === 'wheels') {
      return group({ ja: 'ホイール', en: 'WHEELS' }, chips('wheels', WHEEL_STYLES))
        + (build.wheels === 'stock' && build.body === 'hachiroku' ? '' : group({ ja: 'ホイールの色', en: 'WHEEL COLOUR' }, chips('wheelColour', WHEEL_COLOURS, value => WHEEL_HEX[value as keyof typeof WHEEL_HEX])));
    }
    if (this.#tab === 'aero') {
      return group({ ja: 'フロント', en: 'FRONT' }, chips('front', FRONT_AERO)) + group({ ja: 'リアスポイラー', en: 'REAR SPOILER' }, chips('spoiler', SPOILERS))
        + group({ ja: 'サイド', en: 'SIDES' }, chips('skirts', ['false', 'true'])) + group({ ja: 'フェンダー', en: 'FENDERS' }, chips('fenders', FENDERS));
    }
    if (this.#tab === 'stance') return group({ ja: '車高とキャンバー', en: 'RIDE HEIGHT & CAMBER' }, chips('stance', STANCES));
    return group({ ja: 'ライト', en: 'LAMPS' }, chips('lamps', LAMPS)) + group({ ja: 'リアウインドウ', en: 'REAR WINDOW' }, chips('louvers', ['false', 'true']))
      + group({ ja: 'マフラー', en: 'EXHAUST' }, chips('exhaust', EXHAUSTS)) + group({ ja: 'ミラー', en: 'MIRRORS' }, chips('mirrors', MIRRORS));
  }

  action(name: string): void {
    const [kind, key, value] = name.split(':');
    if (kind === 'tab' && TABS.some(tab => tab.id === key)) { this.#tab = key as Tab; this.render(); return; }
    const build = this.host.build();
    let next: CarBuild | null = null;
    if (kind === 'set' && key && value !== undefined) {
      try { next = validateCarBuild({ ...build, [key]: value === 'true' ? true : value === 'false' ? false : value }); } catch { return; }
    } else if (kind === 'random') next = rivalCar(Math.floor(Math.random() * 2 ** 31), 0.75);
    else if (kind === 'factory') next = stockBuild(paintInfo(build.paint).livery ?? 0, build.body);
    if (!next) return;
    this.host.commit(next);
    if (this.host.active()) this.render(); else this.#viewer.show(next);
  }
}
