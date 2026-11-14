import driving from '../public/assets/drive-optimized/v1/manifest.json';
import archive from './archived-assets.generated.json';
import { expectedStartupAssetBytes } from './startup-assets';

// Exact release metadata lets queued files and compressed responses contribute
// their real decoded sizes before response headers arrive. No guessed percentages.
const sizes: Readonly<Record<string, number>> = {
  ...Object.fromEntries(Object.entries(archive.files).map(([path, file]) => [path, file.bytes])),
  ...Object.fromEntries(driving.files.map(file => [`assets/${file.path}`, file.bytes])),
  ...expectedStartupAssetBytes,
};
export function knownAssetBytes(url: URL): number | undefined {
  const index = url.pathname.lastIndexOf('/assets/');
  return index < 0 ? undefined : sizes[url.pathname.slice(index + 1)];
}
