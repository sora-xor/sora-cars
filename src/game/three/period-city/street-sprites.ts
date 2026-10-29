/**
 * The street-people sprite atlas (public/assets/sprites/street-people.png):
 * pixel-art people, cats, cyclists, parked bosozoku bikes and the routes'
 * maiko, monkeys and deer in 64 x 96
 * cells, sixteen to a row; the cells are wider than a person so an open
 * umbrella fits. scripts/build-street-sprites.ts builds it from the
 * generated sheets in art/street-sprites (docs/art-prompts/street-sprites-v1.json),
 * falling back to the code-drawn sprites (sprites.ts) for any sheet not yet made.
 * A standing adult is 117 pixels tall, feet on row 140.
 */
/**
 * The atlas scale over the first build's (78 pixels to a 1.70 m adult): 1.5 since the finer 470-row art grid (refine
 * round 4), so faces stay crisp on people near the camera. The sheets' own sizes (scripts/build-street-sprites.ts) are
 * at the first scale and multiplied by it.
 */
export const SPRITE_SCALE = 1.5;
export const SPRITE_CELL = { width: 96, height: 144 } as const;
export const SPRITE_COLUMNS = 16;
/** Atlas pixels per metre on a person (a 1.70 m adult is 117 pixels). */
export const SPRITE_PIXELS_PER_METRE = 78 * SPRITE_SCALE / 1.7;
/** Feet rest on this row of a cell. */
export const SPRITE_BASELINE = 140;

/**
 * How a row's columns are laid out, as the sprite shader reads them.
 * walker: 0 front, 1-4 front walk, 5 back, 6-9 back walk, 10 side, 11-14 side walk.
 * cheer (double-width cells): 0-7 front, 8-11 back, 12-15 side. squat: 0 front, 1 side, 2 back, 3 arms folded.
 * signal (double-width cells): 0-3 front (arm out, arm up), 4-7 back, 8-11 side.
 * cat: 0 sitting front, 1 sitting back, 2 sitting side, 3-4 walking side, 5 walking front, 6 walking back, 7 curled up.
 * rider: four double-width side frames (0-7), 8-9 front, 10-11 back. bike: a double-width side (0-1), 2 front, 3 back.
 * deer (double-width sides): 0 standing, 2 and 4 walking, 6 grazing, 8 bowing, 10 lying; then 12 front, 13 front walking, 14 back, 15 back walking.
 * Monkeys use the cat layout, eating in place of curled up.
 */
export const SPRITE_LAYOUT = { walker: 0, cheer: 1, squat: 2, signal: 3, cat: 4, rider: 5, bike: 6, deer: 7 } as const;
export type SpriteLayout = keyof typeof SPRITE_LAYOUT;

/** Every row shares the people's scale; cats are drawn half as large again as life so they read from the road. */
export interface SpriteRowSpec { readonly name: string; readonly layout: SpriteLayout }
/** Atlas rows in order. Walkers first, then their special poses, cats, cyclists and bikes; then the routes' locals
 * (Gion's maiko, the Irohazaka monkeys, Nara's deer). */
export const SPRITE_ROWS: readonly SpriteRowSpec[] = [
  { name: 'salaryman', layout: 'walker' }, { name: 'trench', layout: 'walker' }, { name: 'drunk', layout: 'walker' },
  { name: 'office-lady', layout: 'walker' }, { name: 'police', layout: 'walker' }, { name: 'schoolgirl', layout: 'walker' },
  { name: 'sukeban', layout: 'walker' }, { name: 'schoolboy', layout: 'walker' }, { name: 'bosozoku', layout: 'walker' },
  { name: 'bosozoku-black', layout: 'walker' }, { name: 'fan', layout: 'walker' }, { name: 'crew', layout: 'walker' },
  { name: 'obaachan', layout: 'walker' }, { name: 'housewife', layout: 'walker' }, { name: 'youth', layout: 'walker' },
  { name: 'denim', layout: 'walker' }, { name: 'yukata-woman', layout: 'walker' }, { name: 'yukata-man', layout: 'walker' },
  { name: 'dock', layout: 'walker' }, { name: 'tourist', layout: 'walker' }, { name: 'old-man', layout: 'walker' },
  { name: 'umbrella-salaryman', layout: 'walker' }, { name: 'umbrella-woman', layout: 'walker' },
  { name: 'fan-cheer', layout: 'cheer' }, { name: 'police-signal', layout: 'signal' },
  { name: 'bosozoku-squat', layout: 'squat' }, { name: 'bosozoku-black-squat', layout: 'squat' },
  { name: 'calico', layout: 'cat' }, { name: 'orange-tabby', layout: 'cat' }, { name: 'black-cat', layout: 'cat' },
  { name: 'rider-housewife', layout: 'rider' }, { name: 'rider-schoolboy', layout: 'rider' },
  { name: 'bike-purple', layout: 'bike' }, { name: 'bike-black', layout: 'bike' },
  { name: 'maiko', layout: 'walker' }, { name: 'umbrella-maiko', layout: 'walker' },
  { name: 'monkey', layout: 'cat' }, { name: 'monkey-mother', layout: 'cat' },
  { name: 'deer', layout: 'deer' }, { name: 'deer-stag', layout: 'deer' },
];
export function spriteRow(name: string): number {
  const row = SPRITE_ROWS.findIndex(entry => entry.name === name);
  if (row < 0) throw new Error(`No sprite row "${name}".`);
  return row;
}
export const SPRITE_ATLAS = { width: SPRITE_COLUMNS * SPRITE_CELL.width, height: SPRITE_ROWS.length * SPRITE_CELL.height } as const;
