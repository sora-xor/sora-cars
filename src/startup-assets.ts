import replacements from './startup-assets.generated.json';
import sizes from './startup-asset-sizes.generated.json';

/** Exact lossless replacements. Originals remain available in the retained publication. */
export const optimizedStartupAssets: Readonly<Record<string, string>> = replacements;
export const expectedStartupAssetBytes: Readonly<Record<string, number>> = sizes;
export const startupAssetPath = (path: string): string => optimizedStartupAssets[path] ?? path;
