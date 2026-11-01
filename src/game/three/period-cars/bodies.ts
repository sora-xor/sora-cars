import type { BodyId } from '../../car-builds';
import type { V2, V3 } from './shapes';

/**
 * The five original period bodies, in metres: ground at y = 0, +Z forward and +X on the driver's left (world.ts), so
 * the right-hand-drive driver sits at -X. Profiles run along z from the tail to the nose. Every body fits the
 * driving model's shared car within a few centimetres of overhang.
 */
export type ProceduralBody = Exclude<BodyId, 'hachiroku'>;
export interface BodySpec {
  readonly id: ProceduralBody;
  /** Bumper faces, front and rear. */
  readonly front: number; readonly rear: number;
  /** The shell's own ends, inside the bumpers. */
  readonly nose: number; readonly tail: number;
  readonly wheels: { readonly front: number; readonly rear: number; readonly track: number; readonly radius: number; readonly width: number; readonly arch: number };
  /** The rocker's lower edge. */
  readonly sill: number;
  /** Along z: the side's half width at its widest, the shoulder crease height and the top surface's centre height. */
  readonly half: readonly V2[]; readonly belt: readonly V2[]; readonly deck: readonly V2[];
  /** Top surface crown, the upper side's lean in at the shoulder, and the shoulder's rounding. */
  readonly crown: number; readonly tumble: number; readonly round: number;
  /** The side's widest line, as a share of sill to belt; the two-tone line above the sill. */
  readonly waist: number; readonly lowerLine: number;
  readonly cabin: {
    /** Windscreen base, roof front and rear edges, backlight base (along z). */
    readonly cowl: number; readonly roofFront: number; readonly roofRear: number; readonly tail: number;
    readonly roof: readonly V2[]; readonly roofHalf: number; readonly baseInset: number; readonly crown: number; readonly pillar: number;
    /** Windscreen and backlight curvature: 0 straight, higher rounder (a rotary's bubble hatch). */
    readonly screenCurve: number; readonly backCurve: number;
    /** B-pillar centre and the side glass's rear end. */
    readonly bPillar: number; readonly quarter: number;
    /** The backlight is a lifting hatch (hatchbacks and fastbacks) rather than a fixed screen over a boot. */
    readonly hatch: boolean;
  };
  /** Breakable panels along z: the bonnet, the boot or hatch, and each door (two on a four-door). */
  readonly panels: { readonly hood: V2; readonly trunk: V2; readonly doors: readonly V2[] };
  readonly head: { readonly kind: 'popup' | 'fixed' | 'quad'; readonly x: V2; readonly y: V2; readonly z?: number };
  readonly tailLamps: { readonly kind: 'band' | 'round' | 'blocks'; readonly y: V2; readonly x?: V2 };
  readonly grille: { readonly kind: 'slot' | 'bars' | 'chrome'; readonly half: number; readonly y: V2 };
  readonly bumpers: { readonly colour: 'black' | 'body'; readonly chrome: boolean; readonly front: V2; readonly rear: V2 };
  /** A side intake behind the doors (a midship's), along z and y. */
  readonly vent?: { readonly z: V2; readonly y: V2 };
  /** Factory blister fenders. */
  readonly blisters?: boolean;
  /** The driver's hip, on the right-hand seat. */
  readonly seat: V3;
}

export const BODY_SPECS: Readonly<Record<ProceduralBody, BodySpec>> = {
  kakeru: {
    id: 'kakeru', front: 1.975, rear: -1.975, nose: 1.93, tail: -1.93,
    wheels: { front: 1.15, rear: -1.17, track: 0.715, radius: 0.29, width: 0.19, arch: 0.335 }, sill: 0.22,
    half: [[-1.93, 0.79], [-1.75, 0.825], [-1.2, 0.833], [0.4, 0.833], [1.5, 0.82], [1.82, 0.77], [1.93, 0.71]],
    belt: [[-1.93, 0.86], [-0.6, 0.84], [0.62, 0.74], [1.93, 0.56]],
    deck: [[-1.93, 0.955], [-1.62, 0.98], [-0.86, 0.985], [-0.7, 0.9], [0.62, 0.79], [1.6, 0.64], [1.93, 0.585]],
    crown: 0.03, tumble: 0.035, round: 0.03, waist: 0.5, lowerLine: 0.17,
    cabin: { cowl: 0.62, roofFront: -0.02, roofRear: -0.6, tail: -0.8, roof: [[-0.6, 1.225], [-0.02, 1.235]], roofHalf: 0.575, baseInset: 0.035,
      crown: 0.035, pillar: 0.05, screenCurve: 0.4, backCurve: 0.1, bPillar: -0.3, quarter: -0.52, hatch: false },
    panels: { hood: [0.66, 1.9], trunk: [-1.9, -0.86], doors: [[-0.48, 0.6]] },
    head: { kind: 'popup', x: [0.42, 0.78], y: [0, 0.12], z: 1.5 },
    tailLamps: { kind: 'band', y: [0.68, 0.82] },
    grille: { kind: 'slot', half: 0.5, y: [0.4, 0.46] },
    bumpers: { colour: 'body', chrome: false, front: [0.22, 0.44], rear: [0.25, 0.5] },
    vent: { z: [-0.78, -0.5], y: [0.52, 0.78] },
    seat: [-0.36, 0.34, -0.12],
  },
  hokuto: {
    id: 'hokuto', front: 2.2, rear: -2.2, nose: 2.16, tail: -2.16,
    wheels: { front: 1.33, rear: -1.17, track: 0.735, radius: 0.31, width: 0.215, arch: 0.355 }, sill: 0.22,
    half: [[-2.16, 0.8], [-2.0, 0.85], [-1.4, 0.865], [0.5, 0.865], [1.7, 0.85], [2.05, 0.8], [2.16, 0.73]],
    belt: [[-2.16, 0.9], [-1.0, 0.89], [0.35, 0.84], [1.9, 0.74], [2.16, 0.69]],
    deck: [[-2.16, 0.96], [-1.95, 0.99], [-0.9, 1.0], [0.36, 0.875], [1.4, 0.8], [2.0, 0.745], [2.16, 0.705]],
    crown: 0.04, tumble: 0.04, round: 0.035, waist: 0.48, lowerLine: 0.16,
    cabin: { cowl: 0.36, roofFront: -0.28, roofRear: -0.86, tail: -1.98, roof: [[-0.86, 1.285], [-0.28, 1.3]], roofHalf: 0.6, baseInset: 0.04,
      crown: 0.04, pillar: 0.055, screenCurve: 0.35, backCurve: 0.25, bPillar: -0.4, quarter: -1.1, hatch: true },
    panels: { hood: [0.4, 2.12], trunk: [-2.12, -1.0], doors: [[-0.45, 0.33]] },
    head: { kind: 'fixed', x: [0.36, 0.78], y: [0.6, 0.68] },
    tailLamps: { kind: 'band', y: [0.74, 0.86] },
    grille: { kind: 'slot', half: 0.34, y: [0.555, 0.6] },
    bumpers: { colour: 'body', chrome: false, front: [0.22, 0.42], rear: [0.24, 0.5] },
    seat: [-0.37, 0.36, -0.45],
  },
  mikazuki: {
    id: 'mikazuki', front: 2.13, rear: -2.13, nose: 2.09, tail: -2.09,
    wheels: { front: 1.31, rear: -1.12, track: 0.72, radius: 0.3, width: 0.205, arch: 0.345 }, sill: 0.21,
    half: [[-2.09, 0.78], [-1.9, 0.835], [-1.3, 0.845], [0.6, 0.845], [1.7, 0.825], [2.0, 0.765], [2.09, 0.69]],
    belt: [[-2.09, 0.86], [-1.0, 0.86], [0.5, 0.8], [1.8, 0.665], [2.09, 0.6]],
    deck: [[-2.09, 0.93], [-1.82, 0.97], [-0.8, 0.98], [0.5, 0.84], [1.5, 0.74], [1.95, 0.665], [2.09, 0.625]],
    crown: 0.045, tumble: 0.045, round: 0.05, waist: 0.5, lowerLine: 0.15,
    cabin: { cowl: 0.5, roofFront: -0.12, roofRear: -0.62, tail: -1.84, roof: [[-0.62, 1.25], [-0.12, 1.27]], roofHalf: 0.58, baseInset: 0.045,
      crown: 0.05, pillar: 0.05, screenCurve: 0.5, backCurve: 0.9, bPillar: -0.25, quarter: -0.98, hatch: true },
    panels: { hood: [0.55, 2.06], trunk: [-2.06, -0.95], doors: [[-0.32, 0.47]] },
    head: { kind: 'popup', x: [0.4, 0.76], y: [0, 0.11], z: 1.62 },
    tailLamps: { kind: 'band', y: [0.74, 0.83] },
    grille: { kind: 'slot', half: 0.45, y: [0.38, 0.45] },
    bumpers: { colour: 'body', chrome: false, front: [0.21, 0.46], rear: [0.24, 0.52] },
    seat: [-0.36, 0.34, -0.3],
  },
  raimei: {
    id: 'raimei', front: 2.22, rear: -2.22, nose: 2.18, tail: -2.18,
    wheels: { front: 1.37, rear: -1.25, track: 0.725, radius: 0.31, width: 0.205, arch: 0.35 }, sill: 0.23,
    half: [[-2.18, 0.82], [-2.06, 0.845], [-1.5, 0.848], [1.5, 0.848], [2.06, 0.84], [2.18, 0.8]],
    belt: [[-2.18, 0.92], [0, 0.89], [2.18, 0.84]],
    deck: [[-2.18, 0.955], [-2.0, 0.965], [-1.45, 0.975], [-1.3, 0.93], [0.75, 0.905], [2.0, 0.875], [2.18, 0.86]],
    crown: 0.025, tumble: 0.025, round: 0.022, waist: 0.55, lowerLine: 0.17,
    cabin: { cowl: 0.75, roofFront: 0.08, roofRear: -1.0, tail: -1.42, roof: [[-1.0, 1.37], [0.08, 1.385]], roofHalf: 0.64, baseInset: 0.035,
      crown: 0.025, pillar: 0.05, screenCurve: 0.25, backCurve: 0.15, bPillar: -0.16, quarter: -0.98, hatch: false },
    panels: { hood: [0.8, 2.15], trunk: [-2.15, -1.48], doors: [[-0.14, 0.73], [-1.0, -0.18]] },
    head: { kind: 'quad', x: [0.36, 0.79], y: [0.62, 0.76] },
    tailLamps: { kind: 'round', y: [0.7, 0.86] },
    grille: { kind: 'chrome', half: 0.34, y: [0.6, 0.76] },
    bumpers: { colour: 'black', chrome: true, front: [0.23, 0.44], rear: [0.25, 0.5] },
    seat: [-0.37, 0.37, -0.05],
  },
  hibari: {
    id: 'hibari', front: 1.86, rear: -1.86, nose: 1.82, tail: -1.82,
    wheels: { front: 1.18, rear: -1.1, track: 0.705, radius: 0.28, width: 0.195, arch: 0.33 }, sill: 0.22,
    half: [[-1.82, 0.78], [-1.7, 0.8], [-1.1, 0.8], [1.2, 0.8], [1.65, 0.79], [1.82, 0.75]],
    belt: [[-1.82, 0.93], [0, 0.92], [1.82, 0.86]],
    deck: [[-1.82, 0.96], [-1.7, 0.98], [-1.0, 0.98], [0.95, 0.95], [1.5, 0.89], [1.82, 0.865]],
    crown: 0.03, tumble: 0.03, round: 0.03, waist: 0.5, lowerLine: 0.17,
    cabin: { cowl: 0.95, roofFront: 0.26, roofRear: -1.38, tail: -1.7, roof: [[-1.38, 1.455], [0.26, 1.47]], roofHalf: 0.63, baseInset: 0.035,
      crown: 0.03, pillar: 0.05, screenCurve: 0.25, backCurve: 0.2, bPillar: -0.18, quarter: -1.22, hatch: true },
    panels: { hood: [0.98, 1.8], trunk: [-1.8, -1.5], doors: [[-0.22, 0.92]] },
    head: { kind: 'fixed', x: [0.42, 0.76], y: [0.66, 0.8] },
    tailLamps: { kind: 'blocks', y: [0.64, 0.86], x: [0.5, 0.76] },
    grille: { kind: 'bars', half: 0.38, y: [0.66, 0.78] },
    bumpers: { colour: 'black', chrome: false, front: [0.22, 0.42], rear: [0.25, 0.48] },
    blisters: true,
    seat: [-0.36, 0.4, -0.05],
  },
};
