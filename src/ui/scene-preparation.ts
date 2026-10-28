export interface SceneReadiness {
  status: 'loading' | 'ready' | 'failed';
  message: string;
}

const requiredAssets = ['carAsset', 'sceneryAsset', 'lightingAsset', 'understoryAsset', 'groundAsset'] as const;

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
      backgroundImage: `linear-gradient(90deg, #100d1c52, #100d1c18 60%, #100d1c40), url("${import.meta.env.BASE_URL}assets/story/angles/garage-wide-v2.png")`,
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
