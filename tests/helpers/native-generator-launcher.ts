import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Copy the actual selected SDK implementation into a synthetic checkout. The
 * command fixture is synthetic; the capture implementation is not a test double. */
export async function installNativeGeneratorLauncher(nativeRoot: string) {
  const source = new URL('../../node_modules/@iroha/iroha-js/verify-pinned-native.mjs', import.meta.url);
  const bytes = await readFile(source);
  const destination = join(nativeRoot, 'javascript/iroha_js/verify-pinned-native.mjs');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
  const copied = await readFile(destination);
  if (!copied.equals(bytes)) throw new Error('Fixture SDK capture differs from the selected implementation.');
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
