import { STREET_ASSET_MANIFEST } from './asset-manifest';
import { StreetRaceSession, type StreetRaceBundle } from './session';

export interface StreetRouteDescriptor {
  readonly id: string; readonly japanese: string; readonly name: string;
  readonly bundlePath: string; readonly bundleSha256: string; readonly bundleBytes: number;
  readonly musicPath: string; readonly musicSha256: string; readonly musicBytes: number;
  readonly musicDurationSeconds: number;
}
export const STREET_ROUTES: readonly StreetRouteDescriptor[] = Object.freeze(STREET_ASSET_MANIFEST.map(item => Object.freeze({ ...item })));
export interface LoadedStreetRoute { readonly descriptor: StreetRouteDescriptor; readonly bundle: StreetRaceBundle; }
const admitted = new WeakSet<object>();
const routes = new Map<string, Promise<LoadedStreetRoute>>(), music = new Map<string, Promise<string>>();
export function assertLoadedStreetRoute(value: unknown): asserts value is LoadedStreetRoute {
  if (!value || typeof value !== 'object' || !admitted.has(value)) throw new Error('Street route has not passed packaged-asset admission.');
}
function descriptor(id: string): StreetRouteDescriptor {
  const result = STREET_ROUTES.find(route => route.id === id);
  if (!result) throw new Error('Unknown packaged street route.');
  return result;
}
async function bytes(path: string, size: number, expected: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? './'}${path}`, { redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Street asset is unavailable.');
  const reader = response.body.getReader(), result = new Uint8Array(size); let received = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      if (received + value.length > size) throw new Error('Street asset exceeds its pinned byte length.');
      result.set(value, received); received += value.length;
    }
    if (received !== size) throw new Error('Street asset is truncated.');
    const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', result))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error('Street asset hash mismatch.');
    return result;
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
export function loadStreetRoute(id: string): Promise<LoadedStreetRoute> {
  const route = descriptor(id);
  if (!routes.has(id)) routes.set(id, (async () => {
    const payload = await bytes(route.bundlePath, route.bundleBytes, route.bundleSha256);
    const session = new StreetRaceSession(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)));
    const loaded = Object.freeze({ descriptor: route, bundle: session.bundle });
    admitted.add(loaded); return loaded;
  })().catch(error => { routes.delete(id); throw error; }));
  return routes.get(id)!;
}
/** Playback uses the bytes already checked, never an unchecked second fetch. */
export function loadStreetRouteMusic(id: string): Promise<string> {
  const route = descriptor(id);
  if (!music.has(id)) music.set(id, bytes(route.musicPath, route.musicBytes, route.musicSha256)
    .then(payload => URL.createObjectURL(new Blob([payload], { type: 'audio/mp4' })))
    .catch(error => { music.delete(id); throw error; }));
  return music.get(id)!;
}
