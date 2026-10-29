/** Street routes compiled into the native catalog, in catalog order. Tokyo is
 * the ledger member; the others are local development routes for browser
 * practice that no session can select. */
export const STREET_ROUTE_IDS = ['tokyo-1986', 'irohazaka-1986', 'aizu-wakamatsu-1986', 'kyoto-1986', 'nara-1986'] as const;
export type StreetRouteId = typeof STREET_ROUTE_IDS[number];
export const LEDGER_STREET_ROUTE = 'tokyo-1986';

/** Authoring inputs for one route, relative to the app root. */
export function streetRouteAuthoring(id: string) {
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(id)) throw new Error('Invalid street route id.');
  return { track: `world/authoring/${id}.json`, objects: `world/authoring/${id}.objects.json` };
}

/** The generated native module (and file stem) holding one route's tables. */
export const nativeStreetRouteModule = (id: string) => id.replaceAll('-', '_');

/** Menu names and packaged file stems. Tokyo keeps its original asset names. */
const PACKAGES: Readonly<Record<string, { japanese: string; name: string; stem: string; musicStem: string }>> = {
  'tokyo-1986': { japanese: '東京・暁の街道', name: 'Tokyo · Road to Dawn', stem: 'tokyo', musicStem: 'yasukuni' },
  'irohazaka-1986': { japanese: '日光・いろは坂', name: 'Nikko · Irohazaka', stem: 'irohazaka-1986', musicStem: 'irohazaka-1986' },
  'aizu-wakamatsu-1986': { japanese: '会津若松・城を望む丘へ', name: 'Aizu-Wakamatsu · To the Hill Facing the Castle', stem: 'aizu-wakamatsu-1986', musicStem: 'aizu-wakamatsu-1986' },
  'kyoto-1986': { japanese: '京都・蹴上の煉瓦', name: 'Kyoto · Keage Brick Echo', stem: 'kyoto-1986', musicStem: 'kyoto-1986' },
  'nara-1986': { japanese: '奈良・春日の稜線', name: 'Nara · Kasuga Sky Ridge', stem: 'nara-1986', musicStem: 'nara-1986' },
};
export function streetRoutePackage(id: string) {
  const names = PACKAGES[id];
  if (!names) throw new Error(`No packaged names for street route ${id}.`);
  return names;
}
