import archive from './archived-assets.generated.json';
import { optimizedStartupAssets } from './startup-assets';

/** The explicit immutable publication that retains unchanged music and story assets. */
export const ARCHIVE_ORIGIN = archive.origin;
export const archivedAssetPaths: Readonly<Record<string, { bytes: number; sha256: string }>> = archive.files;
export const reuseArchivedAssets = import.meta.env?.VITE_SORA_CARS_REUSE_ARCHIVE === '1';
export const trustedAssetOrigins: readonly string[] = reuseArchivedAssets ? [ARCHIVE_ORIGIN] : [];

/** Resolve an exact catalog path. Unknown/changed assets remain in this publication. */
export function resolveAssetPath(path: string, base: string, reuseArchive: boolean): string {
  // New lossless derivatives belong to this publication, even if their retained source is archived.
  if (Object.hasOwn(optimizedStartupAssets, path)) return `${base}${optimizedStartupAssets[path]}`;
  if (reuseArchive && Object.hasOwn(archivedAssetPaths, path)) return `${ARCHIVE_ORIGIN}/${path}`;
  return `${base}${path}`;
}
export const assetUrl = (path: string): string => resolveAssetPath(path, import.meta.env?.BASE_URL ?? './', reuseArchivedAssets);
