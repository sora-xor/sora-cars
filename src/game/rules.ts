/** RaceV1 constants mirrored by Iroha's native reference and proof relation. Each track is its real road of 1986
 * (race-roads.ts); a race may run four and a half minutes; `roadHalf` is the road's edge, the rails stand at 6.52 m. */
export const RULES = Object.freeze({ id: 'RaceV1', hz: 30, maxTicks: 8100, maxCars: 8, laps: 3, roadHalf: 6000 });
export const CONTROL = Object.freeze({ throttle: 1, brake: 2, left: 4, right: 8, drift: 16, boost: 32 });
export interface Track {
  id: number; name: string; japanese: string; location: string; length: number;
  sky: string; ground: string; verge: string; accent: string; difficulty: string;
}
export const TRACKS: readonly Track[] = [
  { id: 0, name: 'Midnight Circuit', japanese: '真夜中の峠', location: 'HAKONE · JAPAN', length: 2_000_000,
    sky: '#332169', ground: '#343248', verge: '#61526f', accent: '#c2a7f1', difficulty: 'FLOWING CORNERS' },
  { id: 1, name: 'Harbor Run', japanese: '港の風', location: 'YOKOHAMA · JAPAN', length: 2_400_000,
    sky: '#3b708c', ground: '#586d70', verge: '#a2ada3', accent: '#80dbd1', difficulty: 'FAST & TECHNICAL' },
  { id: 2, name: 'Sakura Pass', japanese: '桜の道', location: 'NIKKO · JAPAN', length: 1_800_000,
    sky: '#bd667f', ground: '#655358', verge: '#ba9091', accent: '#f7b4c3', difficulty: 'TIGHT HAIRPINS' },
];
export interface Livery { id: number; name: string; japanese: string; color: string; dark: string; light: string; }
export const LIVERIES: readonly Livery[] = [
  { id: 0, name: 'Shiro', japanese: '白', color: '#f0e9dc', dark: '#9697a4', light: '#ffffff' },
  { id: 1, name: 'Akai', japanese: '赤', color: '#f33739', dark: '#932038', light: '#ff8d85' },
  { id: 2, name: 'Midori', japanese: '緑', color: '#4ac8ba', dark: '#276c79', light: '#a1f0d9' },
  { id: 3, name: 'Murasaki', japanese: '紫', color: '#9672df', dark: '#4d367e', light: '#c6acff' },
  { id: 4, name: 'Kiiro', japanese: '黄', color: '#f8c646', dark: '#967628', light: '#ffe493' },
  { id: 5, name: 'Aoi', japanese: '青', color: '#578cde', dark: '#28447b', light: '#97c3ff' },
];
export const modulo = (n: number, d: number): number => ((n % d) + d) % d;
