import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { STREET_ASSET_MANIFEST } from '../../src/game/street/asset-manifest';
import type { StreetRaceBundle } from '../../src/game/street/session';

/** Exercise the same pinned local bundle shipped to the browser. */
export function publishedStreetBundle(id = 'tokyo-1986'): StreetRaceBundle {
  const matches = STREET_ASSET_MANIFEST.filter(route => route.id === id);
  assert.equal(matches.length, 1, 'Expected one packaged Street route');
  const route = matches[0]!;
  assert.match(route.bundlePath, /^assets\/street\/[a-z0-9-]+\.json$/);
  const bytes = readFileSync(new URL(`../../public/${route.bundlePath}`, import.meta.url));
  assert.equal(bytes.length, route.bundleBytes, 'Packaged Street bundle size changed');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), route.bundleSha256,
    'Packaged Street bundle digest changed');
  return JSON.parse(bytes.toString('utf8')) as StreetRaceBundle;
}
