import * as THREE from 'three';
import { BUILD_KEYS, isFactoryHachiroku, type CarBuild } from '../../car-builds';
import { addDissolve, carNight, loadDetailedCar } from '../asset-car';
import type { CarModel } from '../car';
import { createDetailedDriver } from '../driver';
import { createPeriodCar, type CarDecals } from './model';

/**
 * The race's cars by build: each grid slot shows the car its build asks for. The factory hachiroku is the detailed
 * fleet loaded at start (unchanged); any other build is made once for the race, the procedural bodies at once and a
 * built hachiroku when its model is ready, and released when the slot's build changes.
 */
export const buildKey = (build: CarBuild) => BUILD_KEYS.map(key => String(build[key])).join('|');
const HOOKS = { dissolve: addDissolve, night: carNight };
/** Seated drivers kept ready for the next procedural car. */
const SPARE_DRIVERS = 3;

export class CarFleet {
  private stock: CarModel[] = [];
  private readonly shown: string[] = [];
  private readonly built = new Set<CarModel>();
  private readonly finished = new Map<string, CarModel>();
  private readonly loading = new Set<string>();
  private readonly drivers: THREE.Group[] = [];
  private fetching = 0;
  private driversFailed = false;

  constructor(private readonly scene: THREE.Scene, private readonly decals: CarDecals) {}

  /** The detailed factory fleet has loaded: one stock hachiroku per slot, now on the road. */
  setStock(models: CarModel[]): void {
    this.stock = models; this.shown.length = 0;
    for (let slot = 0; slot < models.length; slot++) this.shown.push('stock');
    this.topUp();
  }

  /**
   * Swap each slot's car to its build (undefined: the factory hachiroku). `cars` is the race's slot list, changed in
   * place. True when any slot changed, so the caller can refresh what keeps per-car state (pixel-art movers).
   */
  sync(cars: CarModel[], builds: readonly (CarBuild | undefined)[]): boolean {
    if (!this.stock.length) return false;
    let changed = false;
    for (let slot = 0; slot < cars.length && slot < this.stock.length; slot++) {
      const build = builds[slot], key = !build || isFactoryHachiroku(build) ? 'stock' : buildKey(build);
      if (this.shown[slot] === key) continue;
      const model = key === 'stock' ? this.stock[slot]! : this.make(slot, key, build!);
      if (!model) continue;
      const old = cars[slot]!;
      this.scene.remove(old.group);
      if (this.built.delete(old)) old.dispose?.();
      if (model !== this.stock[slot]) this.built.add(model);
      cars[slot] = model; this.scene.add(model.group); this.shown[slot] = key; changed = true;
    }
    return changed;
  }

  private make(slot: number, key: string, build: CarBuild): CarModel | null {
    if (build.body !== 'hachiroku') {
      const driver = this.drivers.pop();
      this.topUp();
      if (!driver && !this.driversFailed) return null;
      return createPeriodCar(build.body, build, this.decals, HOOKS, driver);
    }
    const job = `${slot}|${key}`, done = this.finished.get(job);
    if (done) { this.finished.delete(job); return done; }
    if (!this.loading.has(job)) {
      this.loading.add(job);
      void loadDetailedCar(build, this.decals.flag, this.decals.emblem, this.decals.strip, slot)
        .then(model => { this.finished.set(job, model); }, error => console.error('A built hachiroku failed to load.', error))
        .finally(() => this.loading.delete(job));
    }
    return null;
  }

  private topUp(): void {
    while (this.drivers.length + this.fetching < SPARE_DRIVERS && !this.driversFailed) {
      this.fetching++;
      void createDetailedDriver().then(driver => { this.drivers.push(driver.group); }, error => {
        this.driversFailed = true; console.error('Seated driver failed to load; period cars race without one.', error);
      }).finally(() => { this.fetching--; });
    }
  }
}

/** A Japanese private-car plate (white, green lettering) for the period cars. */
export function plateTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#2e5a47'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = '#2e5a47'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 46px sans-serif'; ctx.fillText('品川 58', 256, 60);
  ctx.font = '700 128px monospace'; ctx.fillText('19-86', 280, 170);
  ctx.font = '700 54px sans-serif'; ctx.fillText('そ', 70, 172);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
