import * as THREE from 'three';
import { optimizedDrivingAssets } from './optimized-driving-assets';
import { optimizedStartupAssets } from '../../startup-assets';

/** Resolve only our known authored scene assets; remote resources and blob URLs stay unchanged. */
export function drivingAssetUrl(url: string): string {
  if (typeof location === 'undefined') return url;
  const parsed = new URL(url, location.href);
  const base = new URL(`${import.meta.env.BASE_URL}assets/`, location.href);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname)) return url;
  const path = parsed.pathname.slice(base.pathname.length);
  const replacement = optimizedStartupAssets[`assets/${path}`]?.slice('assets/'.length) ?? optimizedDrivingAssets[path];
  if (!replacement) return url;
  const resolved = new URL(replacement, base);
  resolved.search = parsed.search;
  resolved.hash = parsed.hash;
  return resolved.href;
}

// glTF child resources live beside each copied optimized glTF. They already have the
// optimized prefix and are deliberately not rewritten a second time.
THREE.DefaultLoadingManager.setURLModifier(drivingAssetUrl);
