import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const streetNativeModulePath = fileURLToPath(import.meta.url);
export const STREET_NATIVE_LAUNCHER = 'javascript/iroha_js/verify-pinned-native.mjs';
/** Execute the exact retained bytes through the installed, local artifact owner.
 * The digest pins executable bytes, not its OS or dependent libraries. */
export async function withStreetNative<T>(nativeRoot: string, binary: string, sha256: string, run: (execute: (args: string[]) => string, capturedPath: string) => Promise<T>) {
  const launcher = await import(pathToFileURL(resolve(nativeRoot, STREET_NATIVE_LAUNCHER)).href) as {
    capturePinnedNativeArtifact(path: string, digest: string): { executable: string; cleanup(): void };
  };
  const capture = launcher.capturePinnedNativeArtifact(binary, sha256);
  try {
    const execute = (args: string[]) => execFileSync(capture.executable, ['--machine', 'app', 'execution', ...args], {
      encoding: 'utf8', timeout: 180_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return await run(execute, capture.executable);
  } finally { capture.cleanup(); }
}
/** Reject symlink ancestry before creating a fresh output child. */
export async function createStreetOutputDirectory(projectRoot: string, requested: string) {
  const root = await realpath(projectRoot), base = resolve(root, 'output');
  const output = resolve(root, relative(resolve(projectRoot), resolve(projectRoot, requested))), tail = relative(base, output);
  if (!tail || /^\.\.(?:[\\/]|$)/.test(tail) || isAbsolute(tail)) throw new Error('Street output must be a fresh child of output/.');
  const pieces = tail.split(/[\\/]/);
  let current = base;
  for (let i = -1; i < pieces.length; i++) {
    if (i >= 0) current = resolve(current, pieces[i]!);
    try { await mkdir(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || i === pieces.length - 1) throw error;
    }
    if (await realpath(current) !== current) throw new Error('Street output ancestry must contain only direct directories.');
  }
  return output;
}
