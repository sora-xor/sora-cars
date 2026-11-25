import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolve the retained SDK inputs or an explicitly selected full Iroha checkout. */
export function nativeSourceRoot(override = process.env.SORA_CARS_IROHA_ROOT) {
  if (override !== undefined) {
    if (!isAbsolute(override)) throw new Error('SORA_CARS_IROHA_ROOT must be an explicit absolute checkout path.');
    return resolve(override);
  }
  return fileURLToPath(new URL('../../vendor/iroha', import.meta.url));
}
