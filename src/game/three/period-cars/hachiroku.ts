import { curve, polyline } from './shapes';
import type { BodyFrame } from './shell';

/**
 * The licensed hachiroku's anchors for kit parts and stripes, measured from the normalized model (asset-car.ts:
 * 4.18 m long, tyres on y = 0, +Z forward, +X on the driver's left) by raycasting it (car-lab.ts measureHachiroku):
 * the paint's half width at the door line, the top surface along the centre and the hatch glass.
 */
export const HACHIROKU_WHEEL_WIDTH = 0.185;
const half = curve([[-2.0, 0.745], [-1.9, 0.76], [-1.6, 0.795], [-1.2, 0.81], [1.0, 0.81], [1.5, 0.8], [1.8, 0.75], [2.0, 0.7]]);
const belt = curve([[-2.0, 0.88], [-1.0, 0.87], [0.75, 0.84], [1.5, 0.76], [2.0, 0.66]]);
const deck = curve([[-2.04, 0.9], [-1.75, 0.93], [0.8, 0.86], [0.9, 0.885], [1.5, 0.79], [1.9, 0.69], [2.05, 0.6]]);
const roof = curve([[-0.95, 1.222], [-0.5, 1.267], [0.18, 1.225]]);
const cowl = 0.76, roofFront = 0.18, roofRear = -0.95, cabinTail = -1.72;
const screen = polyline([[roofFront, roof(roofFront)], [cowl, 0.9]]), hatch = polyline([[cabinTail, 0.935], [roofRear, roof(roofRear)]]);
export const HACHIROKU_FRAME: BodyFrame = {
  front: 2.09, rear: -2.09, nose: 2.05, tail: -2.04, sill: 0.22, lowerLine: 0.17,
  wheels: { front: 1.238, rear: -1.136, track: 0.706, radius: 0.29, width: HACHIROKU_WHEEL_WIDTH, arch: 0.34 },
  half, belt,
  top: (z, x) => {
    const xe = Math.max(0.05, half(z) - 0.07), t = Math.min(1, Math.abs(x) / xe), b = belt(z) + 0.01, d = Math.max(deck(z), b);
    return d - (d - b) * t * t;
  },
  cabin: z => {
    if (z < cabinTail || z > cowl) return null;
    const top = z > roofFront ? screen(z) : z >= roofRear ? roof(z) : hatch(z);
    return { base: belt(z) + 0.02, baseHalf: half(z) - 0.1, top, topHalf: z >= roofRear ? 0.58 : 0.58 + 0.04 * (roofRear - z) / (roofRear - cabinTail) };
  },
  roofFront, roofRear, cowl, cabinTail, hatch: true,
  bumpers: { front: [0.22, 0.45], rear: [0.25, 0.53] },
  doors: [[-0.5, 0.66]], hood: [0.8, 2.0], seat: [-0.355, 0.36, -0.24],
};
