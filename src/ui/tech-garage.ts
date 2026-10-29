import { CHAPTERS, CREW, type Bilingual } from '../game/story';
import {
  AUDIENCES, PRACTICE_FIELDS, TECH_BRANCHES, TECH_NODES, buyPart, fitPart, fittedParts, garageTune, missingParts, partState, practiceField, techNode, tuneFor,
  type FieldId, type GarageSave, type PartState, type TechNode,
} from '../game/garage-tech';
import { CAR_STATS, RACE_GAINS, effectLines, partChips } from '../game/part-effects';
import { TRACKS } from '../game/rules';
import { pitBriefing, type PitBriefing, type WindLevel } from '../game/story-pit';
import { PartViewer } from './part-viewer';
import type { CarTune } from '../game/tuned-engine';

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const both = (text: Bilingual) => `${esc(text.ja)}<small lang="en">${esc(text.en)}</small>`;
export const yen = (amount: number) => `¥${amount.toLocaleString('ja-JP')}`;
const TIERS = ['', 'I', 'II', 'III', 'IV'];
const crewName = (id: string) => { const member = CREW.find(crew => crew.id === id)!; return { ja: member.name.ja.replace(/（.*?）/, ''), en: member.name.en }; };

/** Stock fills 30% of each stat bar and a finished build 100%; a trade-off can dip below stock. */
const statFill = (value: number) => Math.max(4, Math.min(100, 30 + Math.round(value * 70)));
/** A part's effects at a glance: arrows per car stat, the mechanics it adds, and its trade-offs in red. */
function effectChips(id: string): string {
  return `<span class="effect-chips">${partChips(id).map(chip => {
    const kind = chip.level > 0 ? 'up' : chip.level < 0 ? 'down' : 'special', arrows = (chip.level > 0 ? '▲' : '▼').repeat(Math.abs(chip.level));
    const spoken = chip.level ? `<span class="visually-hidden">${chip.level > 0 ? '+' : '−'}${Math.abs(chip.level)}</span>` : '';
    return `<span class="effect-chip ${kind}"><b>${esc(chip.label.ja)}${arrows ? `<i aria-hidden="true">${arrows}</i>` : ''}${spoken}</b><small lang="en">${esc(chip.label.en)}</small></span>`;
  }).join('')}</span>`;
}
const STATE_LABEL: Readonly<Record<PartState, Bilingual>> = {
  fitted: { ja: '装着中', en: 'FITTED' }, stored: { ja: '保管中', en: 'IN STORAGE' }, available: { ja: '購入できる', en: 'AVAILABLE' },
  short: { ja: '賞金が足りない', en: 'SAVE UP' }, locked: { ja: '未解放', en: 'LOCKED' },
};
/** By track id: the city each course runs through, and its character beside `Track.difficulty`. */
const COURSE_CITY: readonly Bilingual[] = [{ ja: '箱根', en: 'HAKONE' }, { ja: '横浜', en: 'YOKOHAMA' }, { ja: '日光', en: 'NIKKO' }];
const COURSE_CHARACTER = ['流れるコーナー', '速くてテクニカル', 'きついヘアピン'];
const WIND: Readonly<Record<WindLevel, Bilingual>> = { light: { ja: '横風 弱', en: 'LIGHT CROSSWIND' }, gusty: { ja: '横風 中', en: 'GUSTY CROSSWIND' }, strong: { ja: '横風 強', en: 'STRONG CROSSWIND' } };
const STYLE: Readonly<Record<string, Bilingual>> = { power: { ja: 'パワー仕様', en: 'POWER BUILD' }, boost: { ja: 'ブースト仕様', en: 'BOOST BUILD' }, tough: { ja: '頑丈仕様', en: 'TOUGH BUILD' } };

/** The car's stat bars, with the selected part previewed as a green gain or a striped red loss. */
function statBars(tune: CarTune, preview?: CarTune): string {
  return `<dl class="tech-stats">${CAR_STATS.map(stat => {
    const now = statFill(stat.value(tune)), next = preview ? statFill(stat.value(preview)) : now;
    return `<div><dt>${both(stat.label)}</dt><dd><span class="tech-bar${next < now ? ' is-loss' : ''}" style="--high:${Math.max(now, next)}%;--low:${Math.min(now, next)}%"><i></i><i></i></span><small>${esc(stat.reading(preview ?? tune))}</small></dd></div>`;
  }).join('')}</dl>${specials(preview ?? tune)}`;
}
function specials(tune: CarTune): string {
  const tags = [
    tune.driftCharge && { ja: `ドリフト充電 ${tune.driftCharge}`, en: 'DRIFT CHARGE' },
    tune.draft && { ja: 'スリップストリーム', en: 'SLIPSTREAM' },
    tune.boostKick && { ja: 'アンチラグ', en: 'ANTI-LAG' },
  ].filter(Boolean) as Bilingual[];
  return tags.length ? `<p class="tech-specials">${tags.map(tag => `<span>${both(tag)}</span>`).join('')}</p>` : '';
}
/** The compact build line beside the showroom car; the full stats live on the tech tree page. */
export function garageSummary(save: GarageSave): string {
  const fitted = fittedParts(save).length;
  const build = save.stock ? { ja: '全車ノーマルで走行中', en: 'RACING EQUAL CARS' } : fitted ? { ja: `${fitted}個の部品を装着`, en: `${fitted} PART${fitted === 1 ? '' : 'S'} FITTED` } : { ja: 'まだノーマル', en: 'STILL STOCK' };
  return `<section class="tech-summary"><div class="tech-summary-head"><span>${both({ ja: '賞金', en: 'PRIZE MONEY' })}</span><b>${yen(save.money)}</b></div><button class="garage-shop-link tech-buy" data-action="tuning">部品を買う・整備ノート <small lang="en">BUY PARTS · TECH TREE →</small></button><p class="tech-summary-build">${both(build)}</p></section>`;
}

interface TechHost {
  screen: HTMLElement; active: () => boolean; notify: (message: string) => void;
  save: () => GarageSave; commit: (save: GarageSave) => void;
  field: () => FieldId; setField: (field: FieldId) => void;
  /** The story chapter this visit prepares for, or null for the garage's own page. */
  chapter: () => number | null;
}
/** A spinning 3D part; `hero` is the detail panel's turntable. */
const partArt = (id: string, kind: 'icon' | 'hero', label = '') =>
  `<canvas class="part-art" data-part-art="${kind}" data-part="${id}"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}></canvas>`;

export class TechGarage {
  #host: TechHost;
  #selected = TECH_NODES[0]!.id;
  /** The part just bought or swapped in, stamped once on the next render. */
  #fitted: string | null = null;
  readonly #art: PartViewer;
  constructor(host: TechHost) {
    this.#host = host;
    this.#art = new PartViewer(() => host.active());
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tech]');
      if (target && !target.hasAttribute('disabled') && this.#host.active()) {
        try { this.action(target.dataset.tech!); } catch (error) { host.notify(error instanceof Error ? error.message : String(error)); }
      }
    });
  }
  get state() {
    const save = this.#host.save(), chapter = this.#host.chapter(), pit = chapter === null ? null : pitBriefing(chapter, save);
    return { selected: this.#selected, money: save.money, owned: [...save.owned], fitted: fittedParts(save), stock: save.stock, fields: [...save.fields], field: this.#host.field(), pit: pit && { chapter, pick: pit.pick?.id ?? null, rivals: pit.rivals.map(rival => ({ name: rival.name.en, value: rival.value })) } };
  }
  /** Open the detail panel on a part, such as the crew's pick for the next race. */
  select(id: string | undefined): void { if (id && techNode(id)) this.#selected = id; }
  action(action: string): void {
    const [kind, id] = action.split(':') as [string, string | undefined];
    const save = this.#host.save();
    if ((kind === 'select' || kind === 'show') && id && techNode(id)) this.#selected = id;
    else if (kind === 'buy' && id) {
      this.#host.commit(buyPart(save, id));
      this.#selected = this.#fitted = id;
      this.#host.notify(`${techNode(id)!.name.ja}を装着しました。 / ${techNode(id)!.name.en} fitted.`);
    } else if (kind === 'fit' && id) { this.#host.commit(fitPart(save, id)); this.#selected = this.#fitted = id; }
    else if (kind === 'stock') this.#host.commit({ ...save, stock: !save.stock });
    else if (kind === 'field' && id && save.fields.includes(id as FieldId)) this.#host.setField(id as FieldId);
    else return;
    this.render();
    if (this.#fitted) { this.#art.celebrate(this.#fitted); this.#fitted = null; }
    if (kind === 'show') this.#host.screen.querySelector('.tech-part-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  render(): void {
    if (!this.#host.active()) return;
    const save = this.#host.save(), tune = garageTune(save), node = techNode(this.#selected)!, state = partState(save, node.id);
    const chapter = this.#host.chapter(), pit = chapter === null ? null : pitBriefing(chapter, save);
    const scroll = this.#host.screen.querySelector('.tech-garage')?.scrollTop ?? 0;
    const preview = state === 'fitted' || save.stock ? undefined : garageTune({ ...save, owned: [...save.owned, node.id], setup: node.fork ? { ...save.setup, [node.fork]: node.id } : save.setup });
    this.#host.screen.innerHTML = `<div class="tech-garage workspace${pit ? ' tech-pit' : ''}">${pit ? this.#pitHeading(save, pit) : `<div class="section-heading"><div><p class="eyebrow">SORA GARAGE / 整備ノート</p><h1>みんなで仕上げる一台。<small class="english-subtitle" lang="en">BUILD IT TOGETHER.</small></h1></div><div class="tech-heading-tools"><p class="tech-wallet"><span>${both({ ja: '賞金', en: 'PRIZE MONEY' })}</span><b>${yen(save.money)}</b></p><button class="small-button" data-action="garage">${both({ ja: '愛車へ戻る', en: 'BACK TO THE CAR' })}</button></div></div>
      <p class="tech-intro">練習と物語の賞金で、仲間と部品を組もう。どの枝にも得意な走り方がある。<span lang="en">Spend prize money from practice and story races on parts. Every branch suits a different way of driving.</span></p>`}
      <div class="tech-layout"><section class="tech-tree" aria-label="Tech tree / 技術ツリー"><div class="tech-tiers" aria-hidden="true"><span></span>${[1, 2, 3, 4].map(tier => `<span>${TIERS[tier]}</span>`).join('')}</div>${TECH_BRANCHES.map(branch => {
        const crew = CREW.find(member => member.id === branch.crew)!, parts = TECH_NODES.filter(part => part.branch === branch.id);
        const tipped = pit?.tip.branches.includes(branch.id);
        return `<div class="tech-branch${tipped ? ' is-tip' : ''}" data-branch="${branch.id}"><header><h2>${both(branch.name)}</h2><p>${esc(crew.name.ja.replace(/（.*?）/, ''))}<small lang="en">${esc(crew.name.en)}</small></p>${tipped ? `<p class="tech-tip-mark">${both({ ja: '今夜のおすすめ', en: 'TONIGHT’S BRANCH' })}</p>` : ''}</header>${[1, 2, 3, 4].map(tier => {
          const cards = parts.filter(part => part.tier === tier).map(part => this.#card(save, part, pit?.pick?.id));
          return cards.length > 1 ? `<div class="tech-fork">${cards.join('<span class="tech-or">または<small lang="en">OR</small></span>')}</div>` : cards[0];
        }).join('')}</div>`;
      }).join('')}</section>
      <aside class="tech-side">${this.#detail(save, node, state, pit)}<section class="tech-car"><h3>${both({ ja: '今の愛車', en: 'YOUR CAR' })}</h3>${statBars(tune, preview)}<button class="tech-toggle" data-tech="stock" aria-pressed="${save.stock}"><span>${both({ ja: '全車ノーマルで走る', en: 'EQUAL CARS (RaceV1)' })}</span><b>${save.stock ? 'ON' : 'OFF'}</b></button><p class="fine-print">${both({ ja: 'オンにすると練習と物語は、全員ノーマル車の元のレースになります。', en: 'On: practice and story become the original race, everyone in stock cars.' })}</p></section>
      ${pit ? this.#grid(save, pit) : `<section class="tech-fields"><h3>${both({ ja: '練習の相手', en: 'PRACTICE FIELD' })}</h3>${PRACTICE_FIELDS.map((field, index) => {
        const open = save.fields.includes(field.id), chosen = this.#host.field() === field.id;
        return `<button class="tech-field ${chosen ? 'chosen' : ''}" data-tech="field:${field.id}" aria-pressed="${chosen}" ${open && !save.stock ? '' : 'disabled'}><span>${both(field.name)}</span><em>×${(field.prize / 100).toFixed(1)}</em><small>${open ? field.budget ? both({ ja: `相手の車 約${yen(field.budget)}`, en: `RIVAL BUILDS ~${yen(field.budget)}` }) : both({ ja: '相手はノーマル車', en: 'STOCK RIVALS' }) : both({ ja: `${practiceField(PRACTICE_FIELDS[index - 1]!.id).name.ja}で3位以内`, en: `PODIUM IN ${PRACTICE_FIELDS[index - 1]!.name.en}` })}</small></button>`;
      }).join('')}</section>`}</aside></div>
      <p class="fine-print tech-fine">${both({ ja: 'XORをかけた対戦と東京ストリートは、いつも全員同じ性能の車です。部品はこの端末の練習と物語だけに効きます。', en: 'Live XOR races and the Tokyo street run always use equal cars. Parts only change practice and story races on this device.' })}</p></div>`;
    const page = this.#host.screen.querySelector<HTMLElement>('.tech-garage'); if (page) page.scrollTop = scroll;
    this.#art.attach(this.#host.screen);
  }
  #card(save: GarageSave, part: TechNode, pick?: string): string {
    const state = partState(save, part.id), selected = part.id === this.#selected;
    const status = state === 'available' || state === 'short' ? yen(part.cost) : STATE_LABEL[state].ja;
    return `<button class="tech-part is-${state} ${selected ? 'selected' : ''}" data-tech="select:${part.id}" aria-pressed="${selected}">${part.id === pick ? `<span class="tech-pick">${both({ ja: 'おすすめ', en: 'PICK' })}</span>` : ''}${partArt(part.id, 'icon')}<span class="tech-tier">${TIERS[part.tier]}</span><strong>${both(part.name)}</strong>${effectChips(part.id)}<span class="tech-status">${esc(status)}</span></button>`;
  }
  #detail(save: GarageSave, node: TechNode, state: PartState, pit: PitBriefing | null): string {
    const missing = missingParts(save, node.id), crew = CREW.find(member => member.id === TECH_BRANCHES.find(b => b.id === node.branch)!.crew)!;
    const action = state === 'available' ? `<button class="primary" data-tech="buy:${node.id}">${both({ ja: `購入して装着 ${yen(node.cost)}`, en: `BUY & FIT ${yen(node.cost)}` })}</button>`
      : state === 'short' ? `<button class="primary" disabled>${both({ ja: `あと${yen(node.cost - save.money)}`, en: `NEED ${yen(node.cost - save.money)} MORE` })}</button>`
      : state === 'stored' ? `<button class="primary" data-tech="fit:${node.id}">${both({ ja: 'こちらに付け替える', en: 'SWAP THIS IN' })}</button>`
      : state === 'fitted' ? `<p class="tech-fitted">${both({ ja: node.fork ? '装着中 · もう一方を買えば付け替えられる' : '装着中', en: node.fork ? 'FITTED · OWN THE OTHER OPTION TO SWAP' : 'FITTED' })}</p>`
      : `<p class="tech-locked">${both({ ja: `必要な部品: ${missing.map(part => part.name.ja).join('、')}`, en: `REQUIRES ${missing.map(part => part.name.en).join(', ')}` })}</p>`;
    const stage = `<div class="part-stage is-${state}">${partArt(node.id, 'hero', `${node.name.ja} / ${node.name.en}`)}${this.#fitted === node.id ? `<p class="part-stamp">${both({ ja: '装着！', en: 'FITTED!' })}</p>` : ''}<p class="part-stage-hint">${both({ ja: 'ドラッグで回す', en: 'DRAG TO SPIN' })}</p></div>`;
    return `<section class="tech-part-detail">${stage}<p class="eyebrow">${esc(TECH_BRANCHES.find(b => b.id === node.branch)!.name.en)} · ${TIERS[node.tier]} · ${esc(crew.name.en)}</p><h2>${both(node.name)}</h2><p class="tech-note-long">${esc(node.note.ja)}<span lang="en">${esc(node.note.en)}</span></p>${effectChips(node.id)}${this.#gains(node, pit?.trackId)}${this.#changes(save, node, state)}${pit?.pick?.id === node.id ? `<p class="tech-pick-note">${both({ ja: `${crewName(pit.tip.crew).ja}のおすすめ：${TRACKS[pit.trackId]!.japanese}で一番効く次の部品`, en: `${crewName(pit.tip.crew).en.split(' ')[0]}’s pick: the next part that gains the most here per yen` })}</p>` : ''}${action}</section>`;
  }
  /** The race time the part was measured to save on each course, tonight's course marked. */
  #gains(node: TechNode, tonight?: number): string {
    const gains = RACE_GAINS[node.id] ?? [0, 0, 0];
    return `<div class="tech-gains"><p>${both({ ja: `1レースで縮まる秒数（${AUDIENCES[node.bestFor].ja}）`, en: `SECONDS SAVED A RACE · FOR ${AUDIENCES[node.bestFor].en}` })}</p><ol>${COURSE_CITY.map((city, track) => `<li${track === tonight ? ' class="is-tonight"' : ''}><span>${both(city)}</span><b>${(gains[track] ?? 0).toFixed(1)}</b></li>`).join('')}</ol><p class="tech-gains-note">${both({ ja: 'シミュレーションの平均。走り方で変わる。', en: 'Simulated average; your driving changes it.' })}</p></div>`;
  }
  /** What the part changes on the player's own car, in km/h, seconds and percent. */
  #changes(save: GarageSave, node: TechNode, state: PartState): string {
    const fitted = fittedParts(save), current = tuneFor(fitted);
    const lines = state === 'fitted'
      ? effectLines(tuneFor(fitted.filter(id => id !== node.id)), current)
      : effectLines(current, tuneFor(fittedParts({ ...save, owned: [...new Set([...save.owned, node.id])], setup: node.fork ? { ...save.setup, [node.fork]: node.id } : save.setup })));
    const columns = state === 'fitted' ? { ja: '外すと → 今', en: 'WITHOUT → NOW' } : { ja: '今 → 装着後', en: 'NOW → WITH IT' };
    return `<div class="tech-effects"><p class="tech-effects-head"><span>${both({ ja: 'あなたの車では', en: 'ON YOUR CAR' })}</span><span>${both(columns)}</span></p><ul>${lines.map(line => `<li class="${line.better ? 'gain' : 'cost'}"><span>${both(line.label)}<em>${esc(line.hint.ja)}<small lang="en">${esc(line.hint.en)}</small></em></span><b>${esc(line.before)} → <strong>${esc(line.after)}</strong></b></li>`).join('')}</ul></div>`;
  }
  /** Tonight's race between the chapter's cutscenes and its start: course, weather, goal and a crew tip. */
  #pitHeading(save: GarageSave, pit: PitBriefing): string {
    const { chapter, conditions: c, tip, pick } = pit, track = TRACKS[pit.trackId]!, crew = CREW.find(member => member.id === tip.crew)!, name = crewName(tip.crew);
    return `<div class="section-heading"><div><p class="eyebrow">CH. ${String(CHAPTERS.indexOf(chapter) + 1).padStart(2, '0')} · 出走前の整備 / PRE-RACE GARAGE</p><h1>${esc(chapter.title.ja)}<small class="english-subtitle" lang="en">${esc(chapter.title.en)}</small></h1></div><div class="tech-heading-tools"><p class="tech-wallet"><span>${both({ ja: '賞金', en: 'PRIZE MONEY' })}</span><b>${yen(save.money)}</b></p><button class="primary pit-go" data-action="pit-go">出走する <small lang="en">START THE RACE ↗</small></button></div></div>
      <section class="pit-brief" aria-label="今夜のレース / Tonight’s race"><dl>
        <div><dt>${both({ ja: 'コース', en: 'COURSE' })}</dt><dd>${esc(track.japanese)} · ${esc(COURSE_CHARACTER[track.id] ?? '')}<small lang="en">${esc(track.name)} · ${esc(track.difficulty)}</small></dd></div>
        <div><dt>${both({ ja: '天候', en: 'WEATHER' })}</dt><dd>雨 ${c.rain}% · ${esc(WIND[c.wind].ja)}<small lang="en">RAIN ${c.rain}% OF THE RACE · ${esc(WIND[c.wind].en)}</small></dd></div>
        <div><dt>${both({ ja: 'コース脇', en: 'ROADSIDE' })}</dt><dd>木${c.trees} · 看板${c.signs} · 油膜${c.oil}<small lang="en">${c.trees} TREES · ${c.signs} SIGNS · ${c.oil} OIL SLICKS A LAP</small></dd></div>
        <div><dt>${both({ ja: '目標', en: 'OBJECTIVE' })}</dt><dd>${both(pit.objective)}</dd></div>
      </dl><figure class="pit-tip" style="--crew-color:${crew.color}"><figcaption>${esc(name.ja)}<small lang="en">${esc(name.en)}</small></figcaption><blockquote><p>「${esc(tip.line.ja)}」</p><p lang="en">“${esc(tip.line.en)}”</p></blockquote>${pick ? this.#pitPick(save, pick, pit.trackId) : `<p class="pit-pick-done">${both({ ja: 'このコースのおすすめは全部そろった。', en: 'Every part the crew suggests for this course is fitted.' })}</p>`}</figure></section>`;
  }
  /** The crew's next part for this course, buyable without leaving the briefing. */
  #pitPick(save: GarageSave, pick: TechNode, track: number): string {
    const state = partState(save, pick.id), buy = state === 'stored'
      ? `<button class="primary" data-tech="fit:${pick.id}">${both({ ja: '付け替える（無料）', en: 'SWAP IT BACK IN · FREE' })}</button>`
      : state === 'available'
        ? `<button class="primary" data-tech="buy:${pick.id}">${both({ ja: `購入して装着 ${yen(pick.cost)}`, en: `BUY & FIT ${yen(pick.cost)}` })}</button>`
        : `<button class="primary" disabled>${both({ ja: `あと${yen(pick.cost - save.money)}`, en: `NEED ${yen(pick.cost - save.money)} MORE` })}</button>`;
    const gain = (RACE_GAINS[pick.id]?.[track] ?? 0).toFixed(1);
    return `<div class="pit-pick"><p>${partArt(pick.id, 'icon')}<span class="tech-pick">${both({ ja: 'おすすめ', en: 'PICK' })}</span><b>${esc(pick.name.ja)}</b><small lang="en">${esc(pick.name.en)}</small></p>${effectChips(pick.id)}<p class="pit-pick-gain">${both({ ja: `今夜のコースで1レース約${gain}秒速く`, en: `ABOUT ${gain} S FASTER A RACE TONIGHT` })}</p><div>${buy}<button class="text-button" data-tech="show:${pick.id}">${both({ ja: '詳しく', en: 'DETAILS' })}</button></div></div>`;
  }
  /** Who is tuned tonight, beside the player's own build. */
  #grid(save: GarageSave, pit: PitBriefing): string {
    const stock = both({ ja: 'ノーマル', en: 'STOCK' }), fitted = fittedParts(save).length;
    const rows = [
      ...pit.rivals.map(rival => `<li><span>${esc(rival.name.ja)}<small lang="en">${esc(rival.name.en.toUpperCase())}${rival.style ? ` · ${esc(STYLE[rival.style]!.en)}` : ''}</small></span><b>${rival.value ? `${yen(rival.value)}<small>${esc(STYLE[rival.style!]!.ja)}</small>` : stock}</b></li>`),
      `<li><span>仲間の5台<small lang="en">FIVE CREW CARS</small></span><b>${stock}</b></li>`,
      `<li class="you"><span>あなた<small lang="en">YOU</small></span><b>${pit.build ? `${yen(pit.build)}<small lang="en">${fitted} PART${fitted === 1 ? '' : 'S'}</small>` : stock}</b></li>`,
    ];
    return `<section class="tech-fields pit-grid"><h3>${both({ ja: '今夜のグリッド', en: 'TONIGHT’S GRID' })}</h3><ul>${rows.join('')}</ul><p class="fine-print">${both(save.stock ? { ja: '全車ノーマル：今夜は全員が同じ車です。', en: 'Equal cars: everyone races the same stock car tonight.' } : { ja: '相手も章が進むほど車を仕上げてくる。', en: 'The rivals keep tuning as the story goes on.' })}</p></section>`;
  }
}
