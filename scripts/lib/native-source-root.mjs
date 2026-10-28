import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Follow the native checkout used by the app's SDK dependency; never fall back to ../iroha. */
export function nativeSourceRoot(override = process.env.SORA_CARS_IROHA_ROOT) {
  if (override !== undefined) {
    if (!isAbsolute(override)) throw new Error('SORA_CARS_IROHA_ROOT must be an explicit absolute checkout path.');
    return resolve(override);
  }
  return fileURLToPath(new URL('../../../iroha-sora-cars-native/', import.meta.url));
}
