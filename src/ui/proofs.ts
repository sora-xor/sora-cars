import { foldingExample, interpolateTrace, toyChallenge, toyTrace, traceCommitment, traceResiduals } from '../game/proof-workshop';
import provenance from '../game/generated/provenance.json';

const base = import.meta.env.BASE_URL;
const stages = [
  { ja: '走りを記録', en: 'TRACE', title: '走りを、数字の列に。', subtitle: 'A drive becomes a table.',
    body: '操作、速度、位置。各時刻の状態を並べると、走行の計算記録「トレース」になります。ここでは一台だけ、17で折り返す小さな数の世界で試します。',
    english: 'Inputs, speed and position form an execution trace. This one-car example uses arithmetic modulo 17.', formula: 'vₜ₊₁ = vₜ + uₜ    pₜ₊₁ = pₜ + vₜ₊₁  (mod 17)' },
  { ja: 'ルールを式に', en: 'CONSTRAINTS', title: '近道を、式が見つける。', subtitle: 'Every transition must obey the rules.',
    body: '正しい計算なら、ルールの式に代入した残りは0。「位置を書き換える」で時刻4の位置を3だけ進めると、前後のつながりが崩れます。',
    english: 'Valid transitions have zero residuals. Add 3 to the position at tick 4 and both neighboring transitions fail.', formula: 'vₜ₊₁ − vₜ − uₜ = 0    pₜ₊₁ − pₜ − vₜ₊₁ = 0' },
  { ja: '多項式にする', en: 'POLYNOMIALS', title: '記録を、ひとつの多項式へ。', subtitle: 'The table becomes a polynomial.',
    body: '8個の位置を通る、次数7以下の多項式Pを計算します。元の点以外でも評価できるようになります。ただし、不正な記録にも多項式は作れるので、ルールの制約も必要です。',
    english: 'Interpolate eight positions into a polynomial of degree at most 7, then evaluate it at more field points. Interpolation alone does not prove valid driving.', formula: 'P(X) = Σ pᵢ · ∏ⱼ≠ᵢ (X − j) / (i − j)  (mod 17)' },
  { ja: '記録を固定', en: 'COMMIT', title: 'あとから、すり替えられないように。', subtitle: 'Commit before the questions arrive.',
    body: '各行をハッシュにして、二つずつまとめて一本の木に。根の値が記録全体を固定します。この教材はSHA-256、ネイティブ実行証明は別ドメインのPoseidon2を使います。',
    english: 'A Merkle root commits to the rows. This teaching tree uses SHA-256; native execution commitments use domain-separated Poseidon2.', formula: 'leaf = H(0 || row)    parent = H(1 || left || right)' },
  { ja: '問いを決める', en: 'CHALLENGE', title: '問いは、固定した記録から。', subtitle: 'Challenges follow the commitments.',
    body: 'Fiat–Shamirでは、公開文とそれまでのコミットメントから問いを導きます。ここでは公開デモ番号も加えて開く行を一つ選びます。一行の確認だけでレースを証明できるわけではありません。',
    english: 'Fiat–Shamir derives challenges from the statement and transcript. This demo also hashes a public round number to select one row. One spot check is not a race proof.', formula: 'challenge = H(domain || statement || transcript)' },
  { ja: '折りたたむ', en: 'FRI', title: '半分、また半分。', subtitle: 'Fold the evaluations, check the degree.',
    body: '折りたたみ用の別の小例です。xと−xの値を、係数βで混ぜてx²の値へ。次数3の式が次数1、次に定数になります。実際のFRIは各段を固定し、ランダムな整合性確認を重ねます。',
    english: 'A separate cubic example folds from degree 3 to 1 to a constant. Real FRI commits each round and checks randomly selected paths and degree bounds.', formula: 'g(x²) = [f(x)+f(−x)]/2 + β · [f(x)−f(−x)]/(2x)' },
  { ja: '結果と台帳', en: 'SETTLEMENT', title: '計算の証明と、台帳の確定。', subtitle: 'Correct computation. Authenticated settlement.',
    body: '結果の証明は、ネットワーク、セッション、固定ルールとトラック、初期状態、参加者と入力鍵、入力履歴、紛争履歴、順位に結び付けます。支払いの確定を確認するには、信頼の起点から台帳の包含と最終性を別に検証します。',
    english: 'Bind the result to its network, session, rules, track, initial state, roster, input keys, transcript, disputes and ranking. A payout also needs authenticated ledger inclusion and finality from a pinned trust context.', formula: 'public statement + execution proof + finalized ledger inclusion' },
];
const caption = (ja: string, en: string): string => `<span lang="ja">${ja}</span><small lang="en">${en}</small>`;

/** An interactive explanation, deliberately isolated from signing and settlement. */
export class ProofWorkshop {
  #host: HTMLElement;
  #stage = 0;
  #tampered = false;
  #beta = 5;
  #round = 0;
  #paused = false;
  #clock = 0;
  #lastTime: number | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #flag = new Image();
  #reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(host: HTMLElement) {
    this.#host = host; this.#flag.src = `${base}assets/sora-flag.png`;
    this.#reducedMotion.addEventListener('change', () => { if (this.#canvas?.isConnected) this.render(true); });
  }
  get state() {
    const rows = toyTrace(this.#tampered), tree = traceCommitment(rows);
    return { stage: this.#stage, name: stages[this.#stage]!.en, teachingOnly: true, prime: 17,
      tampered: this.#tampered, rows, residuals: traceResiduals(rows), root: tree.root,
      challenge: toyChallenge(tree.root, this.#round), beta: this.#beta, folds: foldingExample(this.#beta),
      animationTime: this.#clock, paused: this.#paused, reducedMotion: this.#reducedMotion.matches,
      nativeCryptographicQualification: provenance.cryptographicQualification };
  }
  render(preserveScroll = false): void {
    const scrollTop = preserveScroll ? this.#host.querySelector('.proof-workshop')?.scrollTop ?? 0 : 0;
    const stage = stages[this.#stage]!, state = this.state;
    this.#host.innerHTML = `<main class="workspace proof-workshop">
      <div class="proof-heading"><div><p class="eyebrow">SORA MOTOR CLUB · 数学工房</p><h1>走りを証明する。<small lang="en">THE MATH BEHIND THE FINISH.</small></h1></div><button class="small-button" data-action="practice">${caption('走りに戻る ↗', 'BACK TO THE ROAD')}</button></div>
      <nav class="proof-stages" aria-label="証明のステップ / Proof steps">${stages.map((s, i) => `<button data-action="proof-stage-${i}" ${i === this.#stage ? 'aria-current="step"' : ''}><b>${String(i + 1).padStart(2, '0')}</b>${caption(s.ja, s.en)}</button>`).join('')}</nav>
      <div class="proof-deck"><figure><div class="proof-monitor-label"><span>SORA 数学工房 / MATH LAB</span><span>F₁₇ · 教材 / DEMO</span></div><canvas id="proof-canvas" width="720" height="430" role="img" aria-label="${stage.title} ${stage.subtitle}"></canvas><figcaption><span>${this.#stage + 1} / ${stages.length} · ${stage.en}</span><button data-action="proof-play" aria-pressed="${!this.#paused}" ${this.#reducedMotion.matches ? 'disabled' : ''}>${this.#reducedMotion.matches ? '静止表示 / REDUCED MOTION' : this.#paused ? '▶ 再生 / PLAY' : 'Ⅱ 一時停止 / PAUSE'}</button></figcaption></figure>
      <section class="proof-explanation" aria-live="polite"><p class="eyebrow">${String(this.#stage + 1).padStart(2, '0')} / ${stage.en}</p><h2>${stage.title}<small lang="en">${stage.subtitle}</small></h2><p>${stage.body}<span lang="en">${stage.english}</span></p><div class="proof-equation">${stage.formula.replaceAll('    ', '<br>')}</div>
      ${this.#stage < 5 ? `<button class="proof-experiment ${this.#tampered ? 'altered' : ''}" data-action="proof-tamper" aria-pressed="${this.#tampered}">${caption(this.#tampered ? '正しい位置に戻す ↺' : '位置を書き換える +3', this.#tampered ? 'RESTORE THE POSITION' : 'ALTER TICK 4')}</button><p class="proof-verdict" data-valid="${!this.#tampered}">${caption(this.#tampered ? '制約が不一致：時刻3→4と4→5' : 'この小例の制約はすべて0', this.#tampered ? 'NONZERO RESIDUALS AT TWO TRANSITIONS' : 'ALL TOY TRANSITION RESIDUALS ARE ZERO')}</p>` : ''}
      ${this.#stage === 4 ? `<button class="proof-experiment" data-action="proof-challenge">${caption('次のデモ番号で問いを作る', 'NEXT PUBLIC DEMO ROUND')}</button><p class="proof-small">ROUND ${this.#round} → ROW ${state.challenge.row}</p>` : ''}
      ${this.#stage === 5 ? `<label class="proof-beta" for="proof-beta">係数 β / MIXING CHALLENGE <output>${this.#beta}</output><input id="proof-beta" type="range" min="0" max="16" value="${this.#beta}"></label><p class="proof-small">f(x) = 3 + 2x + 4x² + x³ (mod 17)<br>第2段のβ / SECOND β = 7</p>` : ''}
      ${this.#stage === 6 ? `<p class="proof-verdict" data-valid="false">${caption('ネイティブ証明：リリース資格確認中', 'NATIVE CRYPTOGRAPHIC QUALIFICATION PENDING')}</p>` : ''}
      <div class="proof-step-actions"><button data-action="proof-prev" ${this.#stage === 0 ? 'disabled' : ''}>← 前へ <small lang="en">BACK</small></button><button data-action="proof-next" ${this.#stage === stages.length - 1 ? 'disabled' : ''}>次へ → <small lang="en">NEXT</small></button></div></section></div>
      <details class="proof-data"><summary>この例の数値を見る / INSPECT THE NUMBERS</summary><p>F₁₇: 16 + 1 = 0 · 3 ÷ 2 = 10 · 2 × 10 = 3</p><div class="proof-table-wrap"><table><caption>教材のトレース / TEACHING TRACE</caption><thead><tr><th>時刻 / tick</th><th>入力 / u</th><th>速度 / v</th><th>位置 / p</th><th>残差 / Δv, Δp, u(u−1)</th></tr></thead><tbody>${state.rows.map((row, i) => `<tr ${this.#tampered && i === 4 ? 'class="altered"' : ''}><td>${row.tick}</td><td>${row.input}</td><td>${row.speed}</td><td>${row.position}</td><td>${state.residuals[i]?.join(', ') ?? '—'}</td></tr>`).join('')}</tbody></table></div><p>DEMO SHA-256 ROOT <code id="proof-root">${state.root}</code></p><p>DEMO CHALLENGE <code>${state.challenge.digest}</code></p><p>FRI評価値 / FOLD VALUES: ${state.folds.map(layer => `[${layer.values.join(', ')}]`).join(' → ')}</p><button class="small-button" data-action="proof-download">教材データを保存 ↓ <small lang="en">DOWNLOAD TEACHING DATA</small></button></details>
      <section class="proof-native"><a class="small-button" href="#/prove">公開記録から証明を作る <small lang="en">OPEN NATIVE PROOF WORKER →</small></a><h2>この図と、実際の証明。<small lang="en">FROM THE DIAGRAM TO NATIVE IROHA</small></h2><div><p>このページは教材です。実行証明の作成・検証や送金は行いません。現在のネイティブStreet証明は、Goldilocks素体 p = 2⁶⁴ − 2³² + 1、Fp4拡大体、Poseidon2、sumcheck、WHIRの多項式評価証明を使います。FRIの図は教材用の小例です。<span lang="en">This page does not generate or verify native proofs or move funds. The current native Street proof path uses Goldilocks, Fp4 and Poseidon2, with sumcheck and WHIR opening proofs. The FRI animation is a teaching example.</span></p><p>多項式の次数確認だけでは不十分です。整数の範囲、分岐、衝突順、チェックポイント、非参加車、パディング、順位まで制約が必要です。128ビット以上という目標には、構成全体の解析と独立した暗号レビューが必要です。<span lang="en">Low degree alone is insufficient. The complete constraints and protocol require analysis and independent review before claiming the ≥128-bit security target.</span></p><p>Toriiの応答はエンドポイントの報告です。ブラウザーには完全な最終性検証器がまだありません。支払いの独立検証には、固定したネットワークの信頼情報とネイティブ検証器を使います。<span lang="en">Torii responses are endpoint reports. Independent payout verification needs pinned network trust and the native verifier; the browser lacks a complete finality verifier.</span></p></div><p class="proof-small">BUNDLED PROFILE <code>${provenance.profileId}</code><br>RULES <code>${provenance.rulesHash}</code><br>QUALIFIED: ${String(provenance.cryptographicQualification)}</p><details class="proof-algebra"><summary>制約と低次数検査は、どうつながる？ / HOW ARE CONSTRAINTS LINKED TO FRI?</summary><p>制約多項式Cが、検査するトレース点集合Hですべて0なら、消失多項式 Z<sub>H</sub>(X) = ∏<sub>h∈H</sub>(X−h) で割り切れます。商Qの次数上限を定め、複数の制約の商をランダム係数で結びます。遷移と初期・終了条件では、対象の点集合も異なります。<span lang="en">If C vanishes on the required trace points H, it is divisible by Z<sub>H</sub>. Degree-bounded quotients link the constraints to low-degree testing. Transition and boundary constraints can use different point sets.</span></p><div class="proof-equation">C(X) = Q(X) · Z<sub>H</sub>(X)<br>Q<sub>mix</sub>(X) = Σ αᵢ · Qᵢ(X)</div><p>DEEPは、評価領域の外の点zで多項式を評価し、(P(X)−P(z))/(X−z) のような式で、宣言した値と評価表を結びます。その後のFRIは低次数への近さを検査します。必要な評価領域の大きさ、次数、問い合わせ回数、拡大体、ハッシュ強度を合わせて誤受理確率を評価する必要があります。<span lang="en">DEEP links an evaluation outside the domain to the committed tables. FRI tests proximity to low degree. Security analysis must jointly account for domain size, degree, queries, extension-field challenges and commitments.</span></p><p>実数のグラフとは異なり、上の点は有限体の値です。素体での折り返しを現実の整数オーバーフローの許可として扱うことはできません。<span lang="en">The plotted points belong to a finite field. Modular wraparound does not authorize integer overflow in the real simulation.</span></p></details><p class="proof-sources">原論文 / PAPERS · <a href="https://eccc.weizmann.ac.il/report/2017/134/" target="_blank" rel="noreferrer">FRI ↗</a> · <a href="https://arxiv.org/abs/1903.12243" target="_blank" rel="noreferrer">DEEP-FRI / DEEP-ALI ↗</a></p></section>
    </main>`;
    this.#host.querySelector('.proof-workshop')!.scrollTop = scrollTop;
    const steps = this.#host.querySelector<HTMLElement>('.proof-stages')!, active = steps.querySelector<HTMLElement>('[aria-current="step"]')!;
    steps.scrollLeft = active.offsetLeft - steps.offsetLeft - (steps.clientWidth - active.offsetWidth) / 2;
    this.#canvas = this.#host.querySelector<HTMLCanvasElement>('#proof-canvas');
    this.#ctx = this.#canvas!.getContext('2d', { alpha: false })!;
    this.#ctx.imageSmoothingEnabled = false;
    this.draw(this.#lastTime ?? 0);
  }
  action(name: string): void {
    if (name.startsWith('proof-stage-')) this.#stage = Math.max(0, Math.min(stages.length - 1, Number(name.slice(12)) || 0));
    else if (name === 'proof-next') this.#stage = Math.min(stages.length - 1, this.#stage + 1);
    else if (name === 'proof-prev') this.#stage = Math.max(0, this.#stage - 1);
    else if (name === 'proof-tamper') this.#tampered = !this.#tampered;
    else if (name === 'proof-challenge') this.#round++;
    else if (name === 'proof-play') this.#paused = !this.#paused;
    else if (name === 'proof-download') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'sora-proof-teaching-example.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    this.render(!name.startsWith('proof-stage-') && name !== 'proof-prev' && name !== 'proof-next');
    this.#host.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)?.focus({ preventScroll: true });
  }
  setBeta(value: number): void {
    this.#beta = Math.min(16, Math.max(0, Math.round(value)));
    // Keep the actual slider mounted while dragging or using arrow keys.
    this.#host.querySelector('output')!.textContent = String(this.#beta);
    const values = this.#host.querySelector('.proof-data > p:last-of-type');
    if (values) values.textContent = `FRI評価値 / FOLD VALUES: ${foldingExample(this.#beta).map(layer => `[${layer.values.join(', ')}]`).join(' → ')}`;
  }
  draw(time: number): void {
    const dt = this.#lastTime === null ? 0 : Math.max(0, Math.min(0.1, time - this.#lastTime));
    this.#lastTime = time;
    if (!this.#paused && !this.#reducedMotion.matches) this.#clock += dt;
    const ctx = this.#ctx;
    if (!ctx || !this.#canvas?.isConnected) return;
    ctx.fillStyle = '#19162d'; ctx.fillRect(0, 0, 720, 430);
    ctx.fillStyle = '#362843';
    for (let y = 20; y < 430; y += 24) for (let x = 12; x < 720; x += 24) ctx.fillRect(x, y, 1, 1);
    if (this.#stage <= 1) this.#trace();
    else if (this.#stage === 2) this.#polynomial();
    else if (this.#stage <= 4) this.#commitment();
    else if (this.#stage === 5) this.#folding();
    else this.#settlement();
    ctx.fillStyle = '#080b171c'; for (let y = 0; y < 430; y += 3) ctx.fillRect(0, y, 720, 1);
  }
  #text(text: string, x: number, y: number, size = 16, color = '#f8ecda', align: CanvasTextAlign = 'left'): void {
    const ctx = this.#ctx!; ctx.fillStyle = color; ctx.textAlign = align; ctx.font = `${size}px SoraJP, monospace`; ctx.fillText(text, x, y);
  }
  #line(ax: number, ay: number, bx: number, by: number, color = '#796086', width = 2): void {
    const ctx = this.#ctx!; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  #car(x: number, y: number, color = '#ece5da'): void {
    const ctx = this.#ctx!; ctx.fillStyle = '#0d1023'; ctx.fillRect(x - 28, y + 8, 13, 13); ctx.fillRect(x + 15, y + 8, 13, 13);
    ctx.fillStyle = color; ctx.fillRect(x - 30, y - 5, 60, 20); ctx.fillRect(x - 20, y - 20, 40, 15);
    ctx.fillStyle = '#525577'; ctx.fillRect(x - 15, y - 16, 30, 10); ctx.fillStyle = '#ee4353'; ctx.fillRect(x - 24, y + 3, 12, 4); ctx.fillRect(x + 12, y + 3, 12, 4);
    if (this.#flag.complete && this.#flag.naturalWidth) ctx.drawImage(this.#flag, x - 7, y + 1, 14, 8);
  }
  #trace(): void {
    const rows = toyTrace(this.#tampered), residuals = traceResiduals(rows), focus = Math.floor(this.#clock * 1.3) % 8;
    this.#text(this.#stage === 0 ? 'SORA テスト走行 / INPUT → STATE' : 'ルール照合 / CHECK EACH TRANSITION', 32, 35, 18);
    this.#line(32, 61, 688, 61);
    ['t', 'u', 'v', 'p', 'Δv', 'Δp'].forEach((label, i) => this.#text(label, 60 + i * 58, 90, 17, '#bda8cf'));
    rows.forEach((row, i) => {
      const y = 121 + i * 35, altered = this.#tampered && i === 4;
      if (i === focus) { this.#ctx!.fillStyle = '#70586b55'; this.#ctx!.fillRect(37, y - 24, 345, 31); }
      [row.tick, row.input, row.speed, row.position, ...(residuals[i]?.slice(0, 2) ?? ['—', '—'])].forEach((n, j) => this.#text(String(n), 60 + j * 58, y, 19, (altered && j === 3 || j > 3 && typeof n === 'number' && n !== 0) ? '#ff8a81' : '#f8ecda'));
    });
    for (let lane = 0; lane < 3; lane++) this.#line(442 + lane * 87, 102, 442 + lane * 87, 366, '#75677d');
    const point = rows[focus]!;
    for (let mark = 0; mark < 10; mark++) this.#line(524, 112 + mark * 26, 524, 120 + mark * 26, '#c7b9bc', 3);
    this.#car(523, 338 - point.position * 12, this.#tampered && focus === 4 ? '#ff8a81' : '#f8ecda');
    this.#text(`t = ${focus}`, 602, 90, 20, '#f5d498', 'center');
    this.#text('17で折り返す', 522, 397, 16, '#baa3cb', 'center');
  }
  #polynomial(): void {
    const rows = toyTrace(this.#tampered), focus = Math.floor(this.#clock * 2) % 17;
    this.#text('位置の多項式 P(x) / MOD 17', 32, 35, 18);
    for (let y = 0; y <= 16; y += 4) {
      this.#line(68, 341 - y * 16, 664, 341 - y * 16, '#453653');
      this.#text(String(y), 49, 347 - y * 16, 14, '#b8a0cb', 'right');
    }
    for (let x = 0; x < 17; x++) {
      const px = 76 + x * 36, y = 341 - interpolateTrace(rows, x) * 16;
      this.#line(px, 341, px, y, x < 8 ? '#a98983' : '#655478');
      this.#ctx!.fillStyle = x < 8 ? '#f4d393' : '#96ccc4'; this.#ctx!.fillRect(px - 5, y - 5, 10, 10);
      if (x === focus) { this.#ctx!.strokeStyle = '#fff7e2'; this.#ctx!.strokeRect(px - 9, y - 9, 18, 18); }
      this.#text(String(x), px, 367, 13, '#c2acd0', 'center');
    }
    this.#text(`P(${focus}) = ${interpolateTrace(rows, focus)}`, 670, 51, 22, '#f8ecda', 'right');
    this.#text('■ 元の8点 / TRACE', 55, 407, 15, '#f4d393');
    this.#text('■ 追加の評価点 / EVALUATIONS', 280, 407, 15, '#96ccc4');
  }
  #commitment(): void {
    const state = this.state, levelCount = 4, selected = this.#stage === 4 ? state.challenge.row : Math.floor(this.#clock) % 8;
    this.#text(this.#stage === 3 ? '記録を固定 / MERKLE COMMITMENT' : '固定 → 問い → 開く行 / COMMIT → QUERY', 32, 35, 18);
    for (let level = 0; level < levelCount; level++) {
      const count = 8 >> level, y = 315 - level * 72;
      for (let node = 0; node < count; node++) {
        const x = 360 / count + node * 720 / count, active = node === (selected >> level);
        if (level < 3) this.#line(x, y - 10, 360 / (count / 2) + Math.floor(node / 2) * 720 / (count / 2), y - 55, active ? '#efd098' : '#624c73');
        this.#ctx!.fillStyle = active ? '#f0d39b' : '#806a94'; this.#ctx!.fillRect(x - 23, y - 12, 46, 24);
        this.#text(level === 0 ? `t${node}` : level === 3 ? 'ROOT' : `H${node}`, x, y + 5, 14, '#19162d', 'center');
        if (level === 0 && active) this.#car(x, y + 46);
      }
    }
    this.#text(`${state.root.slice(0, 12)}…${state.root.slice(-8)}`, 360, 68, 18, '#f4d393', 'center');
    this.#text(this.#stage === 4 ? `DEMO ROUND ${this.#round} → ROW ${selected}  ·  開く行と認証パス` : 'SHA-256 教材用の木 / TEACHING TREE', 360, 407, 16, '#c7b1d2', 'center');
  }
  #folding(): void {
    const layers = foldingExample(this.#beta), selected = Math.floor(this.#clock * 1.3) % 8;
    this.#text('FRI / x と −x を組にする', 32, 35, 18);
    this.#text(`β₁ = ${this.#beta}       β₂ = 7`, 685, 68, 19, '#f4d393', 'right');
    layers.forEach((layer, level) => {
      const y = 118 + level * 110, count = layer.values.length;
      this.#text(['degree ≤ 3', 'degree ≤ 1', 'constant'][level]!, 35, y - 32, 16, '#bda6ce');
      layer.values.forEach((value, i) => {
        const x = 35 + (i + 0.5) * 650 / count, selectedNode = i % (count / 2) === selected % (count / 2);
        if (level < 2) {
          const next = i % (count / 2), nextX = 35 + (next + 0.5) * 650 / (count / 2);
          this.#line(x, y + 13, nextX, y + 92, selectedNode ? '#eed099' : '#51405f');
        }
        this.#ctx!.fillStyle = selectedNode || level === 2 ? '#f0d39b' : '#847097';
        this.#ctx!.fillRect(x - 15, y - 15, 30, 30); this.#text(String(value), x, y + 6, 17, '#171427', 'center');
      });
    });
    this.#text('16 → 8 → 4 評価値 / EVALUATIONS', 360, 400, 18, '#f4d393', 'center');
  }
  #settlement(): void {
    this.#text('SORA / 結果を同じレースに結び付ける', 32, 35, 18);
    const labels = [['ネットワーク', 'NETWORK'], ['固定ルール', 'RULES'], ['参加者・入力鍵', 'ROSTER / KEYS'], ['入力・紛争', 'INPUT / DISPUTES']];
    labels.forEach(([ja, en], i) => {
      const x = 104 + i * 171;
      this.#ctx!.fillStyle = '#654c79'; this.#ctx!.fillRect(x - 65, 77, 130, 55);
      this.#text(ja!, x, 101, 16, '#f8ecda', 'center'); this.#text(en!, x, 121, 10, '#d6bfdc', 'center');
      this.#line(x, 134, 360, 180);
    });
    this.#car(360, 193);
    this.#text('公開文 + 順位 / STATEMENT + RANKING', 360, 247, 17, '#f0d39b', 'center');
    this.#line(360, 262, 205, 295); this.#line(360, 262, 515, 295);
    [['実行証明', 'EXECUTION PROOF'], ['台帳の最終性', 'LEDGER FINALITY']].forEach(([ja, en], i) => {
      const x = 205 + i * 310;
      this.#ctx!.fillStyle = '#473552'; this.#ctx!.fillRect(x - 120, 295, 240, 55);
      this.#text(ja!, x, 320, 20, '#f8ecda', 'center'); this.#text(en!, x, 341, 12, '#ccb4d4', 'center');
      const t = this.#clock % 2 / 2; this.#ctx!.fillStyle = '#f0d39b'; this.#ctx!.fillRect(357 + (x - 360) * t, 262 + 30 * t, 6, 6);
    });
    this.#text('両方の検証が必要 / BOTH MUST BE AUTHENTICATED', 360, 402, 16, '#f0d39b', 'center');
  }
}
