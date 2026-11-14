import { assetUrl } from '../asset-url';
import { assetDownloadProgress } from '../asset-downloads';

export interface SceneReadiness {
  status: 'loading' | 'ready' | 'failed';
  message: string;
}

interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number;
  completed: number;
  total: number;
  active: number;
  failed: number;
  retrying: boolean;
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** Byte totals describe requests discovered so far, not a predicted scene size. */
export function sceneDownloadPresentation(download: DownloadProgress, state: SceneReadiness) {
  const { loadedBytes, totalBytes, completed, total, active, failed, retrying } = download;
  const received = `${megabytes(loadedBytes)}${totalBytes > loadedBytes ? ` / ${megabytes(totalBytes)}` : ''}`;
  const detail = total > 0 ? `${received} · ${completed} / ${total} ファイル / files` : '接続を待っています / Waiting for a connection';
  const phase = state.status === 'failed' ? 'failed' : state.status === 'ready' ? 'ready'
    : retrying ? 'retrying' : failed > 0 ? 'failed'
      : total > 0 && completed === total && active === 0 ? 'preparing' : 'downloading';
  const labels = {
    downloading: 'ダウンロード中 / Downloading', retrying: '再接続しています / Reconnecting',
    preparing: '描画を準備しています / Preparing graphics', failed: '読み込みを停止しました / Loading stopped',
    ready: '準備完了 / Ready',
  };
  // A byte bar measures only current downloads. Once those finish, graphics
  // preparation is indeterminate until the renderer has actually drawn them.
  const fraction = state.status === 'ready' ? 1
    : phase === 'downloading' && totalBytes > 0 && loadedBytes < totalBytes ? loadedBytes / totalBytes : null;
  const hint = phase === 'retrying' ? '接続を再試行しています。 / Retrying the connection…'
    : phase === 'preparing' ? '車と街並みを描画しています。 / Preparing cars and scenery…'
      : phase === 'failed' ? '再読み込みして、もう一度お試しください。 / Reload to try again.'
        : phase === 'ready' ? '走り出せます。 / Ready to drive.'
          : '読み込み中のファイル / Current downloads';
  return { phase, label: labels[phase], detail, fraction, hint };
}

export function sceneDownloadMarkup(): string {
  return '<div class="scene-download" data-scene-download><div class="scene-download-heading"><span data-download-phase role="status" aria-live="polite">ダウンロード中 / Downloading</span><span data-download-percent aria-hidden="true"></span></div><progress max="1" aria-label="読み込み状況 / Loading progress"></progress><div class="scene-download-detail" data-download-detail></div><small data-download-hint></small></div>';
}

/** Update only changed values: keep buttons, keyboard focus and live announcements stable. */
export function updateSceneDownloadProgress(parent: ParentNode, state: SceneReadiness, download = assetDownloadProgress()): void {
  const presentation = sceneDownloadPresentation(download, state);
  for (const panel of parent.querySelectorAll<HTMLElement>('[data-scene-download]')) {
    if (panel.dataset.phase !== presentation.phase) panel.dataset.phase = presentation.phase;
    const write = (selector: string, value: string) => {
      const element = panel.querySelector<HTMLElement>(selector)!;
      if (element.textContent !== value) element.textContent = value;
    };
    write('[data-download-phase]', presentation.label);
    write('[data-download-percent]', presentation.fraction === null ? '' : `${Math.floor(presentation.fraction * 100)}%`);
    write('[data-download-detail]', presentation.detail);
    write('[data-download-hint]', presentation.hint);
    const progress = panel.querySelector('progress')!;
    if (presentation.fraction === null) { if (progress.hasAttribute('value')) progress.removeAttribute('value'); }
    else if (progress.value !== presentation.fraction || !progress.hasAttribute('value')) progress.value = presentation.fraction;
    const description = `${presentation.label}. ${presentation.detail}. ${presentation.hint}`;
    if (progress.getAttribute('aria-valuetext') !== description) progress.setAttribute('aria-valuetext', description);
  }
}

/** The course's assets, and `shaderAsset`: its programs compiled and first used, so none stalls the race after GO. */
const requiredAssets = ['carAsset', 'sceneryAsset', 'lightingAsset', 'understoryAsset', 'groundAsset', 'shaderAsset'] as const;

/** Read after drawing the requested course: ground readiness belongs to that frame. */
export function readSceneReadiness(canvas: HTMLCanvasElement): SceneReadiness {
  const data = canvas.dataset;
  if (data.renderer === 'canvas-compatibility') {
    return { status: 'failed', message: 'このブラウザーでは3Dシーンを表示できません。 / This browser could not display the 3D scene.' };
  }
  if (data.renderer === 'failed' || requiredAssets.some(asset => data[asset] === 'failed')) {
    return { status: 'failed', message: '走行シーンを読み込めませんでした。 / The driving scene could not be loaded.' };
  }
  if (data.renderer === 'webgl-3d' && requiredAssets.every(asset => data[asset] === 'detailed')) {
    return { status: 'ready', message: '準備ができました。 / Ready to drive.' };
  }
  return { status: 'loading', message: '走行シーンを準備しています。 / Preparing the driving scene.' };
}

/** Decorative sibling of the race canvas. Import scene-preparation.css in the owning UI.
 * The owner supplies announcements/actions and explicitly hides this cover with null;
 * this class never changes a race, starts a timer, or decides when a live view is covered.
 */
export class ScenePreparationCover {
  readonly #element: HTMLDivElement;
  #status: SceneReadiness['status'] | null = null;
  #disposed = false;

  constructor(parent: HTMLElement) {
    this.#element = parent.ownerDocument.createElement('div');
    this.#element.className = 'scene-preparation-cover';
    this.#element.hidden = true;
    this.#element.inert = true;
    this.#element.setAttribute('aria-hidden', 'true');
    // The opaque foundation also hides unfinished frames before the artwork decodes.
    Object.assign(this.#element.style, {
      position: 'absolute', inset: '0', zIndex: '-2', pointerEvents: 'none', backgroundColor: '#171124',
      backgroundImage: `linear-gradient(90deg, #100d1c52, #100d1c18 60%, #100d1c40), url("${assetUrl('assets/story/angles/garage-wide-v2.png')}")`,
    });
    parent.append(this.#element);
  }

  update(state: SceneReadiness | null): void {
    if (this.#disposed || this.#status === (state?.status ?? null)) return;
    this.#status = state?.status ?? null;
    this.#element.hidden = state === null;
    if (state) this.#element.dataset.state = state.status;
    else delete this.#element.dataset.state;
  }

  dispose(): void {
    this.#disposed = true;
    this.#element.remove();
  }
}
