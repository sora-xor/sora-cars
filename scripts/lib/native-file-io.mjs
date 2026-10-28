import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const nativeFileModulePath = fileURLToPath(import.meta.url);
const MiB = 1024 * 1024;

/** Read at most the admitted file size plus one growth-detection byte. The
 * default remains Street's 32 MiB; only callers explicitly admitting 64 MiB use it. */
export async function readBoundedNativeBytes(file, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64 * MiB) throw new Error('Invalid native byte bound.');
  const metadata = await file.stat(), size = metadata.size;
  if (!metadata.isFile() || !Number.isSafeInteger(size) || size <= 0 || size > limit) throw new Error('Native export exceeds its byte bound.');
  const bytes = Buffer.alloc(size + 1);
  let used = 0;
  while (used < bytes.length) {
    const { bytesRead } = await file.read(bytes, used, bytes.length - used, used);
    if (!bytesRead) break;
    used += bytesRead;
  }
  const after = await file.stat();
  if (used !== size || !after.isFile() || after.size !== size) throw new Error('Native export changed while reading.');
  return bytes.subarray(0, size);
}

/** Bound streamed hashing by the admitted size, not by a possibly growing EOF. */
export async function hashBoundedNativeFile(file, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2 * 1024 * MiB) throw new Error('Invalid native hash byte bound.');
  const metadata = await file.stat(), size = metadata.size;
  if (!metadata.isFile() || !Number.isSafeInteger(size) || size <= 0 || size > limit) throw new Error('Native artifact exceeds its byte bound.');
  const chunk = Buffer.alloc(Math.min(64 * 1024, size + 1)), hash = createHash('sha256');
  let used = 0;
  while (used <= size) {
    const { bytesRead } = await file.read(chunk, 0, Math.min(chunk.length, size + 1 - used), used);
    if (!bytesRead) break;
    used += bytesRead;
    if (used > size) throw new Error('Native artifact changed while hashing.');
    hash.update(chunk.subarray(0, bytesRead));
  }
  const after = await file.stat();
  if (used !== size || !after.isFile() || after.size !== size) throw new Error('Native artifact changed while hashing.');
  return { bytes: size, sha256: hash.digest('hex') };
}

async function withDirectFile(path, run) {
  const absolute = resolve(path);
  if (await realpath(absolute) !== absolute) throw new Error(`Artifact must be a direct file: ${absolute}`);
  const file = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let primary;
  try { return await run(file); }
  catch (error) { primary = error; throw error; }
  finally {
    try { await file.close(); }
    catch (cleanup) {
      if (primary !== undefined) throw new AggregateError([primary, cleanup], `Native read and descriptor cleanup failed: ${absolute}`, { cause: primary });
      throw cleanup;
    }
  }
}
export async function readBoundedNativeFile(path, limit = 32 * MiB) {
  return withDirectFile(path, file => readBoundedNativeBytes(file, limit));
}
export async function hashBoundedNativePath(path, limit) {
  return withDirectFile(path, file => hashBoundedNativeFile(file, limit));
}
export async function readBoundedNativeJson(path, limit = 32 * MiB) {
  return JSON.parse((await readBoundedNativeFile(path, limit)).toString('utf8'));
}
