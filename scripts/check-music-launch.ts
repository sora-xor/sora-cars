import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { MusicLaunchSnapshot } from '../src/chain/music-launch';

// This command reviews local public JSON only; it never fetches, signs or submits.
try {
  if (process.argv.length !== 3) throw new Error('Usage: npx tsx scripts/check-music-launch.ts <endpoint-snapshot.json>');
  const file = await open(process.argv[2]!, constants.O_RDONLY | constants.O_NONBLOCK);
  let input: unknown;
  try {
    const maximum = 32 * 1024 * 1024;
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Launch snapshot must be a regular file.');
    if (stat.size > maximum) throw new Error('Launch snapshot exceeds 32 MiB.');
    const buffer = Buffer.alloc(maximum + 1); let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null); if (!bytesRead) break; offset += bytesRead; }
    if (offset > maximum) throw new Error('Launch snapshot exceeds 32 MiB.');
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)));
  } finally { await file.close(); }
  const { reviewMusicLaunch } = await import('../src/chain/music-launch');
  const report = reviewMusicLaunch(input as MusicLaunchSnapshot);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 1;
} catch (error) {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? ` [${error.code}]` : '';
  console.error(`Music launch review unavailable${code}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
