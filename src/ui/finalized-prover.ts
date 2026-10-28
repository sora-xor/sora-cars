import { FinalizedProofController, finalizedVerificationCommand, type FinalizedProofSelection } from '../chain/finalized-prover';
import { selectProofDirectory, supportsProofDirectoryExport, type ProofDirectoryExport } from './proof-export';
import { ToriiReplayController } from '../chain/finalized-replay';
import { supportsReplayStaging } from './replay-staging';
import { completeOwnedCleanup } from './proof-cleanup';
import './finalized-prover.css';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const subtitle = (text: string) => `<small lang="en">${escape(text)}</small>`;
const FILE_IO_TIMEOUT_MS = 120_000;
const FILE_CLEANUP_WAIT_MS = 5_000;
function boundedWait<T>(promise: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => { clear(); reject(signal?.reason ?? new DOMException('File operation cancelled.', 'AbortError')); };
    const timer = setTimeout(() => { clear(); reject(new DOMException('Local file operation exceeded its deadline.', 'TimeoutError')); }, milliseconds);
    const clear = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    signal?.addEventListener('abort', stop, { once: true });
    // Always observe the original promise, including after timeout/cancellation.
    promise.then(value => { clear(); resolve(value); }, error => { clear(); reject(error); });
    if (signal?.aborted) { clear(); stop(); }
  });
}
const fields = [
  ['network_id', 'native-network-id', 'ネットワーク ID', 'NETWORK ID', 128],
  ['trusted_context_id', 'native-context-id', '信頼するコンテキスト', 'TRUSTED CONTEXT ID', 128],
  ['first_height', 'native-first-height', '信頼の起点ブロック', 'FIRST HEIGHT', 20],
  ['target_height', 'native-target-height', '対象ブロック', 'TARGET HEIGHT', 20],
  ['target_block_hash', 'native-block-hash', '対象ブロックのハッシュ', 'TARGET BLOCK HASH', 128],
  ['session_id', 'native-session-id', 'セッション ID', 'SESSION ID', 128],
  ['revision', 'native-revision', '記録のリビジョン', 'RECORD REVISION', 20],
  ['terminal_tick', 'native-terminal-tick', '終了ティック', 'TERMINAL TICK', 10],
] as const;
const messages: Record<string, [string, string]> = {
  idle: ['記録を選んで、検証の準備を。', 'Choose your files and independently selected trust details.'],
  fetching: ['Toriiから確定記録を取得中。', 'Streaming the selected retained record into a temporary disk file.'],
  validating: ['ファイルと指定内容を照合中。', 'Checking the canonical request against your selection.'],
  reserving: ['証明ワーカーに接続中。', 'Reserving a public proof job.'],
  uploading: ['公開リプレイを送信中。', 'Uploading the native public replay.'],
  running: ['ネイティブ証明を作成中。', 'The native worker is processing the public replay.'],
  complete: ['ワーカーから結果が届きました。', 'Worker reports completion. Save the files for independent verification.'],
  downloading: ['検証用ファイルを保存中。', 'Streaming the proof into your verification folder.'],
  downloaded: ['検証用フォルダーを保存しました。', 'Files saved. Independent native verification is still required.'],
  cancelling: ['中止を要求しています。', 'Requesting cancellation; worker cleanup is not yet confirmed.'],
  cancelled: ['ブラウザーでの処理を中止しました。', 'Browser operation cancelled. Worker cleanup is not independently confirmed.'],
  failed: ['処理を完了できませんでした。', 'The operation did not complete. Check the details below.'],
  disposed: ['この画面での処理は終了しました。', 'This browser workflow has ended.'],
};

/** Public computation transport. It never creates a settlement envelope or a browser verification verdict. */
export class FinalizedProvingPanel {
  #host: HTMLElement;
  #active = false;
  #generation = 0;
  #controller: FinalizedProofController | null = null;
  #closing: Promise<void> = Promise.resolve();
  #cleanupPending = false;
  #request: File | null = null;
  #replay: File | null = null;
  #evidence: File | null = null;
  #source: 'file' | 'torii' = 'file';
  #toriiOrigin = '';
  #replayController: ToriiReplayController | null = null;
  #proofInputs: { requestFile: Blob; replay: Blob } | null = null;
  #origin = import.meta.env.VITE_PROOF_WORKER_URL ?? '';
  #selection: Record<string, string> = {
    network_id: import.meta.env.VITE_TAIRA_NETWORK_ID ?? '',
    trusted_context_id: import.meta.env.VITE_FINALITY_CONTEXT_ID ?? '',
    first_height: import.meta.env.VITE_FINALITY_CONTEXT_HEIGHT ?? '',
    target_height: '', target_block_hash: '', session_id: '', revision: '', terminal_tick: '', mode: 'selection', computation: 'street',
  };
  #reviewed = false;
  #starting = false;
  #saving = false;
  #saveAbort: AbortController | null = null;
  #directory: ProofDirectoryExport | null = null;
  #savedFolder = '';
  #error = '';
  #cleanupError = '';

  constructor(host: HTMLElement) {
    this.#host = host;
    host.addEventListener('submit', event => {
      if (this.#active && (event.target as HTMLElement).id === 'native-proof-form') {
        event.preventDefault(); void this.#start();
      }
    });
    host.addEventListener('input', event => {
      if (!this.#active) return;
      const input = event.target as HTMLInputElement;
      if (input.id === 'native-torii-origin') this.#toriiOrigin = input.value;
      else if (input.id === 'native-worker-origin') this.#origin = input.value;
      else if (input.id === 'native-pins-reviewed') this.#reviewed = input.checked;
      else if (input.dataset.selection) { this.#selection[input.dataset.selection] = input.value; this.#reviewed = false; }
      this.#sync();
    });
    host.addEventListener('change', event => {
      if (!this.#active) return;
      const input = event.target as HTMLInputElement;
      if (input.id === 'native-request-file') { this.#request = input.files?.[0] ?? null; this.#reviewed = false; }
      if (input.id === 'native-replay-file') this.#replay = input.files?.[0] ?? null;
      if (input.id === 'native-evidence-file') { this.#evidence = input.files?.[0] ?? null; this.#reviewed = false; }
      if (input.id === 'native-replay-source') { this.#source = input.value === 'torii' ? 'torii' : 'file'; this.#reviewed = false; }
      this.#sync();
    });
    host.addEventListener('click', event => {
      if (!this.#active) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      if (button.id === 'native-proof-cancel') void this.#cancel();
      if (button.id === 'native-proof-save') void this.#save();
    });
    window.addEventListener('pagehide', () => this.close());
    window.addEventListener('pageshow', event => { if (event.persisted && location.hash === '#/prove') this.render(); });
  }
  get state() {
    const state = this.#controller?.state, replay = this.#replayController?.state;
    return { phase: this.#error ? 'failed' : state?.phase ?? replay?.phase ?? 'idle', assurance: 'endpoint-reported',
      replaySource: this.#source, replayBytesWritten: replay?.bytesWritten ?? 0,
      computation: state?.report?.computation.kind ?? this.#selection.computation,
      bytesWritten: state?.bytesWritten ?? 0, savedFolder: this.#savedFolder || null,
      independentVerification: false, settlementEnabled: false };
  }
  render(): void {
    this.#active = true;
    this.#host.innerHTML = `<main class="workspace native-proof-room" lang="ja">
      <div class="native-proof-heading"><div><p class="eyebrow">SORA MOTOR CLUB · RECORD OFFICE / 記録室</p><h1>走りを、証明に。${subtitle('YOUR DRIVE. PUBLICLY CHECKABLE.')}</h1></div><img src="${import.meta.env.BASE_URL}assets/sora-flag.png" alt="SORA"></div>
      <p class="native-proof-intro">確定した記録から証明を作り、誰でも同じ結果を確かめられるように。${subtitle('Create a proof from finalized native records, then verify it independently.')}</p>
      <div class="native-proof-layout"><form id="native-proof-form" novalidate>
      <fieldset id="native-proof-fields"><legend>01 / 公開ファイル${subtitle('PUBLIC FILES')}</legend>
        <p>ネイティブの検証リクエストと、公開記録の取得元を選んでください。${subtitle('Choose a native request and replay source. Local gameplay JSON is not finalized ledger evidence.')}</p>
        <label class="native-proof-file">検証リクエスト${subtitle('request.nrt · up to 4 KiB')}<input id="native-request-file" type="file" accept=".nrt,application/octet-stream"><span id="native-request-name"></span></label>
        <label class="native-field">記録の取得元${subtitle('REPLAY SOURCE')}<select id="native-replay-source"><option value="file" ${this.#source === 'file' ? 'selected' : ''}>ファイルを選択 / LOCAL NATIVE REPLAY</option><option value="torii" ${this.#source === 'torii' ? 'selected' : ''}>Toriiから取得 / FETCH FROM TORII</option></select></label>
        <div id="native-replay-local">
        <label class="native-proof-file">確定記録と公開リプレイ${subtitle('replay.nrt · up to 1 GiB')}<input id="native-replay-file" type="file" accept=".nrt,application/octet-stream"><span id="native-replay-name"></span></label></div>
        <div id="native-replay-torii" hidden>
          <label class="native-field">Toriiの接続先${subtitle('TORII ORIGIN')}<input id="native-torii-origin" type="url" autocomplete="off" spellcheck="false" value="${escape(this.#toriiOrigin)}" placeholder="https://your-torii.example"></label>
          <label class="native-proof-file">公開入力の証拠${subtitle('evidence.nrt · canonical native evidence · up to 16 MiB')}<input id="native-evidence-file" type="file" accept=".nrt,application/octet-stream"><span id="native-evidence-name"></span></label>
          <p class="native-proof-note">公開入力の証拠をToriiに送り、指定した確定記録を取得します。取得データは一時ファイルに保存し、中止・画面移動で削除します。${subtitle('Torii combines your public input evidence with the exact retained ledger record. The download is staged on disk, up to 256 MiB, and removed on cancellation or navigation.')} ${subtitle('A download is endpoint-reported. Accepted inputs and finality still require independent native verification. Local Stock or Street draft JSON cannot replace evidence.nrt.')}</p>
        </div>
        <label class="native-field">証明ワーカー${subtitle('PUBLIC PROOF WORKER')}<input id="native-worker-origin" type="url" autocomplete="off" spellcheck="false" value="${escape(this.#origin)}" placeholder="http://127.0.0.1:8789"></label>
        <p class="native-proof-note">送信するのは選択した公開データです。ウォレットへの接続や署名は必要ありません。${subtitle('Only the selected public data is sent. No wallet connection or signing keys are needed.')}</p>
        <h2>02 / 信頼の起点と対象${subtitle('INDEPENDENT TRUST & RECORD SELECTION')}</h2>
        <p>ネットワークの信頼できる配布情報と、確認したい記録をもとに入力してください。リクエストファイルやワーカーからは自動入力しません。${subtitle('Enter trust details from an independent network source and select the exact record. These fields are not populated from the request or worker.')}</p>
        <div class="native-selection-grid">${fields.map(([key, id, ja, en, max]) => `<label class="native-field">${ja}${subtitle(en)}<input id="${id}" data-selection="${key}" maxlength="${max}" ${max < 64 ? 'inputmode="numeric"' : ''} autocomplete="off" spellcheck="false" value="${escape(this.#selection[key] ?? '')}"></label>`).join('')}
        <label class="native-field">検証するゲーム${subtitle('NATIVE COMPUTATION')}<select id="native-computation" data-selection="computation"><option value="street" ${this.#selection.computation === 'street' ? 'selected' : ''}>ストリート / STREET</option><option value="stock_race" ${this.#selection.computation === 'stock_race' ? 'selected' : ''}>ストックレース / STOCK RACE</option></select></label>
        <label class="native-field">記録の種類${subtitle('RECORD MODE')}<select id="native-mode" data-selection="mode"><option value="selection" ${this.#selection.mode === 'selection' ? 'selected' : ''}>選択した記録 / SELECTION</option><option value="archived_settled" ${this.#selection.mode === 'archived_settled' ? 'selected' : ''}>精算済み記録 / ARCHIVED SETTLED</option></select></label></div>
        <label class="native-proof-review"><input id="native-pins-reviewed" type="checkbox" ${this.#reviewed ? 'checked' : ''}><span>別の信頼できる情報から、上の指定内容を確認しました。${subtitle('I checked this selection against an independent trusted source.')}</span></label>
      </fieldset>
      <div class="native-proof-actions"><button id="native-proof-start" class="primary" type="submit">証明を作る${subtitle('CREATE PUBLIC PROOF ↗')}</button><button id="native-proof-cancel" class="small-button" type="button" disabled>処理を中止${subtitle('CANCEL JOB')}</button></div>
      <p class="native-proof-note">保存にはフォルダー選択に対応するデスクトップブラウザーが必要です。非対応の環境ではネイティブCLIを使ってください。${subtitle('Saving requires a desktop browser with folder access. Use the native CLI on other browsers.')}</p>
      </form><aside class="native-proof-console">
        <p class="eyebrow">SORA · PUBLIC COMPUTATION</p>
        <div class="native-proof-lamps" aria-hidden="true"><i></i><i></i><i></i></div>
        <div id="native-proof-status" role="status" aria-live="polite" data-phase="idle"></div>
        <p id="native-proof-error" role="alert" hidden></p>
        <p class="native-proof-assurance">ブラウザーによる独立検証は未実施${subtitle('ENDPOINT-REPORTED · NOT INDEPENDENTLY VERIFIED')}</p>
        <div id="native-proof-report"></div>
        <button id="native-proof-save" class="small-button" type="button" disabled>検証用ファイルを保存${subtitle('SAVE VERIFICATION FOLDER ↓')}</button>
        <p id="native-proof-saved"></p>
        <details class="native-cli"><summary>ネイティブで確かめる${subtitle('VERIFY WITH THE NATIVE CLI')}</summary><p>保存したフォルダーで、レビュー済みのIrohaバイナリーを指定して実行します。<code>./iroha</code>をそのバイナリーのパスに置き換えてください。${subtitle('From the saved folder, replace ./iroha with the path to your reviewed Iroha binary. Keep the original request and replay alongside the proof.')}</p><textarea id="native-verification-command" readonly rows="5" spellcheck="false">${escape(finalizedVerificationCommand())}</textarea><p>ワーカーが返す検証フラグはワーカー自身の報告です。この画面から精算や送金は行いません。${subtitle('Reported verification flags are the worker’s claims. This page does not settle a game or transfer funds.')}</p></details>
        <a class="text-button" href="#/proofs">証明のしくみを学ぶ${subtitle('EXPLORE THE PROOF MATH →')}</a>
      </aside></div></main>`;
    this.#sync();
  }
  close(): void {
    if (!this.#active) return;
    this.#active = false; ++this.#generation;
    this.#saveAbort?.abort();
    const controller = this.#controller, directory = this.#directory, replayController = this.#replayController;
    this.#controller = null; this.#directory = null; this.#replayController = null; this.#proofInputs = null;
    this.#starting = false; this.#saving = false; this.#error = '';
    this.#trackCleanup(completeOwnedCleanup([controller?.dispose(), directory?.abort(), replayController?.dispose()]));
  }
  #trackCleanup(operation: Promise<void>): Promise<void> {
    this.#cleanupPending = true;
    const closing = Promise.allSettled([this.#closing, operation]).then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') this.#cleanupError = failed.reason instanceof Error ? failed.reason.message : 'Incomplete local files could not be removed.';
    }).finally(() => { if (this.#closing === closing) { this.#cleanupPending = false; this.#sync(); } });
    this.#closing = closing;
    return closing;
  }
  async #start(): Promise<void> {
    if (this.#starting || this.#saving) return;
    const generation = this.#generation;
    const current = () => this.#active && generation === this.#generation;
    const selected = { request: this.#request, replay: this.#replay, evidence: this.#evidence,
      source: this.#source, workerOrigin: this.#origin.trim(), toriiOrigin: this.#toriiOrigin.trim(),
      reviewed: this.#reviewed, fields: { ...this.#selection } };
    const previousController = this.#controller, previousReplay = this.#replayController;
    let controller: FinalizedProofController | null = null, replayController: ToriiReplayController | null = null;
    this.#error = ''; this.#savedFolder = ''; this.#starting = true; this.#sync();
    try {
      if (!supportsProofDirectoryExport()) throw new Error('Use a desktop browser with folder saving support, or the native CLI.');
      if (!selected.request || selected.source === 'file' && !selected.replay || selected.source === 'torii' && !selected.evidence) throw new Error('Select the native request and the replay or public evidence file.');
      if (selected.source === 'torii' && !supportsReplayStaging()) throw new Error('This browser needs private disk storage to fetch a replay; select an exported native replay file instead.');
      if (!selected.reviewed) throw new Error('Check the independent trust and record selection before starting.');
      await boundedWait(this.#closing, FILE_CLEANUP_WAIT_MS);
      await previousController?.dispose();
      await previousReplay?.dispose();
      if (!current()) return;
      this.#controller = null; this.#replayController = null; this.#proofInputs = null;
      if (!/^(?:0|[1-9][0-9]*)$/.test(selected.fields.terminal_tick!)) throw new Error('Terminal tick must be a canonical decimal integer.');
      const expected: FinalizedProofSelection = {
        computation: selected.fields.computation as FinalizedProofSelection['computation'],
        network_id: selected.fields.network_id!, trusted_context_id: selected.fields.trusted_context_id!,
        first_height: selected.fields.first_height!, target_height: selected.fields.target_height!,
        target_block_hash: selected.fields.target_block_hash!, session_id: selected.fields.session_id!,
        revision: selected.fields.revision!, mode: selected.fields.mode as FinalizedProofSelection['mode'],
        terminal_tick: Number(selected.fields.terminal_tick),
      };
      // Validate the selected worker before any Torii upload, keeping the fetch phase visible.
      controller = new FinalizedProofController({ origin: selected.workerOrigin, onState: () => { if (current()) this.#sync(); } });
      let proofInputs: { requestFile: Blob; replay: Blob };
      if (selected.source === 'torii') {
        replayController = new ToriiReplayController({ origin: selected.toriiOrigin, onState: () => { if (current()) this.#sync(); } });
        this.#replayController = replayController;
        proofInputs = await replayController.load({ requestFile: selected.request, evidenceFile: selected.evidence!, expected });
      } else proofInputs = { requestFile: selected.request, replay: selected.replay! };
      if (!current()) { this.#trackCleanup(completeOwnedCleanup([controller.dispose(), replayController?.dispose()])); return; }
      this.#proofInputs = proofInputs;
      this.#controller = controller;
      await controller.start({ ...proofInputs, expected });
    } catch (error) {
      if (current() && controller?.state.phase !== 'cancelled' && replayController?.state.phase !== 'cancelled') this.#error = error instanceof Error ? error.message : 'Public proof request failed.';
      // A delayed failure only closes the instances owned by this start operation.
      if (replayController) this.#trackCleanup(replayController.dispose());
    }
    finally { if (current()) { this.#starting = false; this.#sync(); } }
  }
  async #cancel(): Promise<void> {
    const generation = this.#generation, controller = this.#controller, replayController = this.#replayController;
    this.#saveAbort?.abort();
    this.#error = '';
    // Both cancellation intents are delivered immediately; cleanup is tracked even
    // when a filesystem promise settles after the short UI observation deadline.
    const cleanup = completeOwnedCleanup([controller?.cancel(), replayController?.dispose()]);
    try { await boundedWait(this.#trackCleanup(cleanup), FILE_CLEANUP_WAIT_MS); }
    catch (error) { if (this.#active && generation === this.#generation) this.#error = error instanceof Error ? error.message : 'Cancellation could not be delivered.'; }
    if (this.#active && generation === this.#generation) this.#sync();
  }
  async #save(): Promise<void> {
    if (this.#saving || !this.#controller || !this.#proofInputs) return;
    const controller = this.#controller, generation = this.#generation;
    const { requestFile: request, replay } = this.#proofInputs;
    this.#saving = true; this.#error = ''; this.#saveAbort = new AbortController(); this.#sync();
    let directory: ProofDirectoryExport | null = null;
    try {
      // The chooser runs in the click's activation, before any network await.
      directory = await boundedWait(selectProofDirectory({ signal: this.#saveAbort.signal }), FILE_IO_TIMEOUT_MS, this.#saveAbort.signal);
      this.#directory = directory;
      if (!this.#active || generation !== this.#generation) { this.#trackCleanup(directory.abort()); return; }
      await boundedWait(directory.writeInputs(request, replay), FILE_IO_TIMEOUT_MS, this.#saveAbort.signal);
      const output = directory;
      await controller.download({ write: chunk => output.writeProofChunk(chunk), close: result => output.complete(result!.report, finalizedVerificationCommand()), abort: () => output.abort() });
      if (this.#active && generation === this.#generation) this.#savedFolder = directory.folder;
    } catch (error) {
      this.#saveAbort?.abort();
      if (directory) await boundedWait(this.#trackCleanup(directory.abort()), FILE_CLEANUP_WAIT_MS).catch(() => {});
      if (this.#active && generation === this.#generation && !(error instanceof DOMException && error.name === 'AbortError') && controller.state.phase !== 'cancelled') this.#error = error instanceof Error ? error.message : 'Verification folder could not be saved.';
    } finally {
      if (this.#active && generation === this.#generation) { this.#directory = null; this.#saveAbort = null; this.#saving = false; this.#sync(); }
    }
  }
  #sync(): void {
    if (!this.#active || !this.#host.querySelector('#native-proof-form')) return;
    const state = this.#controller?.state, replayState = this.#replayController?.state;
    const operationPhase = state?.phase ?? replayState?.phase ?? 'idle';
    const phase = this.#error ? 'failed' : operationPhase;
    const locked = this.#starting || this.#saving || this.#cleanupPending || ['complete', 'downloading', 'downloaded', 'cancelling'].includes(operationPhase);
    this.#host.querySelector<HTMLFieldSetElement>('#native-proof-fields')!.disabled = locked;
    this.#host.querySelector<HTMLInputElement>('#native-pins-reviewed')!.checked = this.#reviewed;
    this.#host.querySelector<HTMLButtonElement>('#native-proof-start')!.disabled = locked;
    this.#host.querySelector<HTMLButtonElement>('#native-proof-cancel')!.disabled = !this.#controller && !this.#replayController || ['idle', 'cancelled', 'disposed', 'failed'].includes(operationPhase);
    this.#host.querySelector<HTMLButtonElement>('#native-proof-save')!.disabled = this.#starting || this.#saving || this.#cleanupPending || operationPhase !== 'complete';
    this.#host.querySelector<HTMLElement>('#native-replay-local')!.hidden = this.#source !== 'file';
    this.#host.querySelector<HTMLElement>('#native-replay-torii')!.hidden = this.#source !== 'torii';
    this.#host.querySelector('#native-evidence-name')!.textContent = this.#evidence ? `${this.#evidence.name} · ${this.#evidence.size.toLocaleString()} B` : '';
    this.#host.querySelector('#native-request-name')!.textContent = this.#request ? `${this.#request.name} · ${this.#request.size.toLocaleString()} B` : '';
    this.#host.querySelector('#native-replay-name')!.textContent = this.#replay ? `${this.#replay.name} · ${this.#replay.size.toLocaleString()} B` : '';
    const status = this.#host.querySelector<HTMLElement>('#native-proof-status')!;
    status.dataset.phase = phase;
    const [ja, en] = messages[phase] ?? messages.running!;
    status.innerHTML = `<strong>${escape(ja)}</strong>${subtitle(en)}${state?.bytesWritten || replayState?.bytesWritten ? `<p>${(state?.bytesWritten || replayState?.bytesWritten || 0).toLocaleString()} B</p>` : ''}${this.#cleanupPending ? `<p>未完了ファイルの後処理を待っています。${subtitle('Local file cleanup is pending. A new export waits for the owned write to finish.')}</p>` : ''}`;
    const error = this.#host.querySelector<HTMLElement>('#native-proof-error')!;
    error.hidden = !this.#error && !state?.error && !this.#cleanupError;
    error.innerHTML = `内容を確認して、もう一度お試しください。${subtitle(this.#error || state?.error || '')}${this.#cleanupError ? subtitle(this.#cleanupError) : ''}`;
    this.#host.querySelector('#native-proof-saved')!.textContent = this.#savedFolder;
    const flags = state?.report;
    this.#host.querySelector('#native-proof-report')!.innerHTML = flags ? `<p>ワーカーからの報告${subtitle('WORKER-REPORTED FLAGS')}</p><p>${flags.computation.kind === 'stock_race' ? 'ストックレース' : 'ストリート'}${subtitle(flags.computation.kind === 'stock_race' ? 'STOCK RACE · NATIVE EXECUTION ENVELOPE' : 'STREET · NATIVE COMPONENT PROOFS')}</p><dl>${[
      ['記録の最終性', 'Record finality', flags.record_finality_verified], ['計算の検証', 'Computation', flags.computation_verified],
      ['最新状態の確認', 'Latest freshness', flags.latest_freshness_verified], ['離脱処理の再実行', 'Removal transitions replayed', flags.removal_transitions_replayed],
      ['プロファイルの登録', 'Profile registered', flags.profile_registered], ['精算の検証', 'Settlement', flags.settlement_verified],
      ['構成全体の安全性', 'Composed security qualified', flags.composed_security_qualified],
    ].map(([ja, en, value]) => `<div><dt>${ja}${subtitle(String(en))}</dt><dd>${String(value)}</dd></div>`).join('')}</dl>` : '';
  }
}
