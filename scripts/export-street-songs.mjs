import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Render each street route's song through the actual game synthesizer, as the
// soundtrack export does, then master it and encode the AAC file the route plays.
// Usage: node scripts/export-street-songs.mjs [--route=<street route id>]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'world/audio');
const evidence = path.join(root, 'output/audio/street-songs');
const sampleRate = 44100, tailSeconds = 1, leadInSeconds = .08, targetLufs = -16, ceilingDbtp = -1.5;
const requested = process.argv.find(argument => argument.startsWith('--route='))?.slice(8);
await mkdir(evidence, { recursive: true });
function command(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root }); const chunks = [], errors = [];
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({ stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors).toString() }) : reject(new Error(`${binary} exited ${code}: ${Buffer.concat(errors)}`)));
  });
}
async function loudness(file) {
  const result = await command('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `loudnorm=I=${targetLufs}:TP=${ceilingDbtp}:LRA=11:print_format=json`, '-f', 'null', '-']);
  const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  assert.ok(match, `loudness measurements available for ${file}`);
  const measurement = JSON.parse(match[0]);
  return { integratedLufs: Number(measurement.input_i), truePeakDbtp: Number(measurement.input_tp), loudnessRangeLu: Number(measurement.input_lra) };
}
async function durationMs(file) {
  const probe = JSON.parse((await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout.toString());
  assert.equal(probe.streams[0].channels, 2); assert.equal(Number(probe.streams[0].sample_rate), sampleRate);
  return Math.round(Number(probe.format.duration) * 1000);
}

const server = await createServer({ root, server: { port: 0, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const address = server.httpServer.address(), origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], rendered = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/__street_song_export`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>SORA street song export</title><link rel="icon" href="data:,">' }));
  await page.goto(`${origin}/__street_song_export`);
  const songs = await page.evaluate(async () => (await import('/src/game/street/route-songs.ts')).STREET_ROUTE_SONGS.map(song => ({ route: song.route, name: song.name, japanese: song.japanese })));
  const selected = songs.filter(song => requested === undefined || song.route === requested);
  assert.ok(selected.length, 'requested street song exists');
  for (const song of selected) {
    const download = page.waitForEvent('download', { timeout: 300000 });
    const render = await page.evaluate(async ({ route, sampleRate, tailSeconds, leadInSeconds }) => {
      const { GameAudio } = await import('/src/game/audio.ts');
      const { STREET_ROUTE_SONGS, composeStreetSong, streetSongSectionsMs } = await import('/src/game/street/route-songs.ts');
      const song = STREET_ROUTE_SONGS.find(item => item.route === route), score = composeStreetSong(song);
      const scoreSeconds = score.beats * 60 / score.bpm;
      const context = new OfflineAudioContext(2, Math.ceil((leadInSeconds + scoreSeconds + tailSeconds) * sampleRate), sampleRate);
      const audio = new GameAudio(context); audio.musicEnabled = true; audio.setVolumes(.75, 0); audio.setScore(score);
      const lastOnset = leadInSeconds + scoreSeconds - 1 / sampleRate, windowSeconds = 8;
      audio.scheduleOfflineMusic(Math.min(windowSeconds, lastOnset));
      const windows = [];
      for (let at = windowSeconds; at < lastOnset; at += windowSeconds) {
        windows.push(context.suspend(at).then(async () => {
          audio.scheduleOfflineMusic(Math.min(windowSeconds, lastOnset - context.currentTime));
          await context.resume();
        }));
      }
      const buffer = await context.startRendering(); await Promise.all(windows); audio.dispose();
      const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
      // The race ends at the finish line: fade over the last eight bars, then the releases.
      const fadeStartSeconds = leadInSeconds + (score.beats - 32) * 60 / score.bpm, fadeEndSeconds = leadInSeconds + scoreSeconds + .5;
      for (let frame = Math.floor(fadeStartSeconds * sampleRate); frame < buffer.length; frame++) {
        const position = Math.min(1, Math.max(0, (frame / sampleRate - fadeStartSeconds) / (fadeEndSeconds - fadeStartSeconds)));
        const gain = (1 - position * position * (3 - 2 * position)) ** 1.4;
        data[0][frame] *= gain; data[1][frame] *= gain;
      }
      const bytes = new Uint8Array(44 + buffer.length * 2 * 4), view = new DataView(bytes.buffer);
      const text = (offset, value) => [...value].forEach((letter, index) => bytes[offset + index] = letter.charCodeAt(0));
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 8, true);
      view.setUint16(32, 8, true); view.setUint16(34, 32, true); text(36, 'data'); view.setUint32(40, buffer.length * 8, true);
      for (let frame = 0; frame < buffer.length; frame++) for (let channel = 0; channel < 2; channel++) view.setFloat32(44 + (frame * 2 + channel) * 4, data[channel][frame], true);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })), link = document.createElement('a');
      link.href = url; link.download = 'render.wav'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { bpm: score.bpm, beats: score.beats, sections: song.sections, noteCount: score.notes.length, scoreSeconds,
        sectionsMs: streetSongSectionsMs(song, leadInSeconds) };
    }, { route: song.route, sampleRate, tailSeconds, leadInSeconds });
    const raw = path.join(evidence, `${song.route}-render-f32.wav`);
    await (await download).saveAs(raw);
    const before = await loudness(raw);
    const gainDb = Math.min(targetLufs - before.integratedLufs, ceilingDbtp - before.truePeakDbtp);
    assert.ok(Number.isFinite(gainDb), `${song.route} loudness can be mastered`);
    const m4a = path.join(destination, `${song.route}.m4a`);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', raw, '-af', `volume=${gainDb.toFixed(6)}dB`,
      '-c:a', 'aac', '-b:a', '192k', '-ar', String(sampleRate), '-ac', '2', '-map_metadata', '-1',
      '-metadata', `title=${song.japanese} / ${song.name}`, '-metadata', 'artist=SORA CARS', '-metadata', 'album=SORA CARS — Street Runs 1986', '-metadata', 'date=2026', m4a]);
    const bytes = await readFile(m4a), after = await loudness(m4a);
    assert.ok(after.truePeakDbtp <= -1, `${song.route} keeps headroom after encoding`);
    const entry = { route: song.route, title: song.name, japanese: song.japanese, ...render, sampleRate,
      file: path.relative(root, m4a), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      durationMs: await durationMs(m4a), mastering: { gainDb, targetLufs, ceilingDbtp, input: before, output: after } };
    rendered.push(entry);
    await rm(raw);
    await writeFile(path.join(evidence, `${song.route}.json`), JSON.stringify(entry, null, 2) + '\n');
    process.stdout.write(`${song.route} ${song.name}: ${(entry.durationMs / 1000).toFixed(3)}s, ${render.bpm.toFixed(2)} bpm, ${after.integratedLufs} LUFS, sha256 ${entry.sha256}\n`);
    await page.reload();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
