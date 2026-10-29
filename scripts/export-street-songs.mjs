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
// Usage: node scripts/export-street-songs.mjs [--route=<street route id>] [--store]
//
// --store makes the music store's recordings instead, as scripts/export-soundtrack.mjs does for
// the score: a 16-bit WAV master, a 320 kbps MP3 and a 30-second preview of each song in
// public/assets/music/audio, entered in its manifest after the supplied recordings. The route's
// own file is never rewritten. Renders vary run to run in fine detail (two renders of one score
// differ by about -29 dB), so the store's song is checked against world/audio/<route>.m4a as the
// same music instead of the same bytes: equal length, and a difference at least 20 dB below it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'world/audio');
const evidence = path.join(root, 'output/audio/street-songs');
const sampleRate = 44100, tailSeconds = 1, leadInSeconds = .08, targetLufs = -16, ceilingDbtp = -1.5;
const requested = process.argv.find(argument => argument.startsWith('--route='))?.slice(8);
const store = process.argv.includes('--store'), storeDestination = path.join(root, 'public/assets/music/audio');
await mkdir(evidence, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
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
async function fileInfo(file) {
  const bytes = await readFile(file);
  return { path: `/assets/music/audio/${path.basename(file)}`, bytes: bytes.length, sha256: sha(bytes) };
}
/** Two recordings' lengths in frames and the energy of their difference relative to the first, in dB. */
async function difference(a, b) {
  const decode = async file => (await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])).stdout;
  const x = await decode(a), y = await decode(b);
  let signal = 0, error = 0;
  for (let offset = 0; offset < Math.min(x.length, y.length); offset += 4) { const p = x.readFloatLE(offset), q = y.readFloatLE(offset); signal += p * p; error += (p - q) ** 2; }
  return { frames: [x.length / 8, y.length / 8], differenceDb: 10 * Math.log10(error / signal) };
}
/** The store checks of scripts/export-soundtrack.mjs: the whole song, finite, unclipped, ending in silence. */
async function inspect(file, expectedSeconds) {
  assert.ok(Math.abs(await durationMs(file) / 1000 - expectedSeconds) < .12, `${file} contains the entire song`);
  const decoded = (await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])).stdout;
  let peak = 0, power = 0, lastPeak = 0;
  for (let offset = 0; offset < decoded.length; offset += 4) {
    const value = decoded.readFloatLE(offset);
    assert.ok(Number.isFinite(value), `${file} has finite samples`);
    peak = Math.max(peak, Math.abs(value)); power += value ** 2;
    if (offset >= decoded.length - sampleRate * 2 * 4 / 10) lastPeak = Math.max(lastPeak, Math.abs(value));
  }
  const rms = Math.sqrt(power / (decoded.length / 4));
  assert.ok(peak > .1 && peak < 1, `${file} is audible without digital clipping`);
  assert.ok(rms > .02, `${file} has musical energy`);
  assert.ok(lastPeak < .0001, `${file} ends in silence after the release tail`);
  return { peak, rms, last100msPeak: lastPeak };
}
/** The store's WAV master, MP3 and preview of one song, from the raw render and the route's mastering gain. */
async function storeRecording(song, raw, gainDb, render, before, number, total) {
  const base = path.join(storeDestination, song.file), wav = `${base}.wav`, mp3 = `${base}.mp3`, preview = `${base}-preview.mp3`;
  const tags = ['-metadata', `title=${song.japanese} / ${song.name}`, '-metadata', 'artist=SORA CARS', '-metadata', 'album=SORA CARS — Original Soundtrack',
    '-metadata', `track=${number}/${total}`, '-metadata', 'date=2026', '-metadata', 'genre=Electronic'];
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', raw, '-af', `volume=${gainDb.toFixed(6)}dB,aresample=dither_method=triangular`, '-c:a', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2', ...tags, wav]);
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', String(sampleRate), '-id3v2_version', '3', ...tags, mp3]);
  // From bar nine, as the soundtrack's previews start.
  const previewStartSeconds = leadInSeconds + 32 * 60 / render.bpm;
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(previewStartSeconds), '-i', wav, '-t', '30', '-af', 'afade=t=in:st=0:d=0.3,afade=t=out:st=27.3:d=2.5', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(sampleRate), ...tags, preview]);
  const checked = await inspect(wav, render.durationSeconds);
  await inspect(mp3, render.durationSeconds); assert.ok(Math.abs(await durationMs(preview) / 1000 - 30) < .12, `${preview} is thirty seconds`);
  const after = await loudness(wav);
  assert.ok(after.truePeakDbtp <= -1.35, `${song.file} retains mastering headroom`);
  return { file: song.file, route: song.route, title: song.name, japanese: song.japanese, bpm: render.bpm, bars: render.beats / 4, beats: render.beats,
    sections: render.sections, noteCount: render.noteCount, durationSeconds: render.durationSeconds, scoreSeconds: render.scoreSeconds,
    sampleRate, channels: 2, bitsPerSample: 16, ...after, peak: checked.peak, rms: checked.rms,
    wav: await fileInfo(wav), mp3: await fileInfo(mp3), preview: { ...await fileInfo(preview), durationSeconds: 30, startSeconds: previewStartSeconds },
    mastering: { gainDb, targetLufs, ceilingDbtp, input: before, ending: 'Eight-bar fade to the finish line with the natural release tail, as the race plays it.' } };
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
  const songs = await page.evaluate(async () => (await import('/src/game/street/route-songs.ts')).STREET_ROUTE_SONGS.map(song => ({ route: song.route, name: song.name, japanese: song.japanese, file: song.file })));
  const selected = songs.filter(song => requested === undefined || song.route === requested);
  assert.ok(selected.length, 'requested street song exists');
  // The store numbers these songs after the soundtrack and the supplied recordings.
  const manifestPath = path.join(storeDestination, 'manifest.json'), manifest = store ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
  const before = manifest?.tracks.filter(track => !track.route) ?? [], stored = [];
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
        durationSeconds: buffer.length / sampleRate, sectionsMs: streetSongSectionsMs(song, leadInSeconds) };
    }, { route: song.route, sampleRate, tailSeconds, leadInSeconds });
    const raw = path.join(evidence, `${song.route}-render-f32.wav`);
    await (await download).saveAs(raw);
    const input = await loudness(raw);
    const gainDb = Math.min(targetLufs - input.integratedLufs, ceilingDbtp - input.truePeakDbtp);
    assert.ok(Number.isFinite(gainDb), `${song.route} loudness can be mastered`);
    const m4a = path.join(store ? evidence : destination, `${song.route}.m4a`);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', raw, '-af', `volume=${gainDb.toFixed(6)}dB`,
      '-c:a', 'aac', '-b:a', '192k', '-ar', String(sampleRate), '-ac', '2', '-map_metadata', '-1',
      '-metadata', `title=${song.japanese} / ${song.name}`, '-metadata', 'artist=SORA CARS', '-metadata', 'album=SORA CARS — Street Runs 1986', '-metadata', 'date=2026', m4a]);
    const bytes = await readFile(m4a), after = await loudness(m4a);
    assert.ok(after.truePeakDbtp <= -1, `${song.route} keeps headroom after encoding`);
    const entry = { route: song.route, title: song.name, japanese: song.japanese, ...render, sampleRate,
      file: path.relative(root, m4a), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      durationMs: await durationMs(m4a), mastering: { gainDb, targetLufs, ceilingDbtp, input, output: after } };
    rendered.push(entry);
    if (store) {
      const routeFile = path.join(destination, `${song.route}.m4a`), pinned = await readFile(routeFile), match = await difference(routeFile, m4a);
      assert.equal(match.frames[1], match.frames[0], `${song.route}: the store render has the race recording's length`);
      assert.ok(match.differenceDb < -20, `${song.route}: the store render is the race's song (${match.differenceDb.toFixed(1)} dB apart)`);
      const number = before.length + songs.findIndex(item => item.route === song.route) + 1;
      stored.push({ ...await storeRecording(song, raw, gainDb, render, input, number, before.length + songs.length),
        routeRecording: { path: `world/audio/${song.route}.m4a`, bytes: pinned.length, sha256: sha(pinned), differenceDb: Number(match.differenceDb.toFixed(2)) } });
      await rm(m4a);
    } else await writeFile(path.join(evidence, `${song.route}.json`), JSON.stringify(entry, null, 2) + '\n');
    await rm(raw);
    process.stdout.write(`${song.route} ${song.name}: ${(entry.durationMs / 1000).toFixed(3)}s, ${render.bpm.toFixed(2)} bpm, ${after.integratedLufs} LUFS, sha256 ${entry.sha256}\n`);
    await page.reload();
  }
  assert.deepEqual(errors, []);
  if (store) {
    // Route songs follow every other track, in route-song order; a single-route run replaces only its own.
    const byRoute = new Map([...manifest.tracks.filter(track => track.route), ...stored].map(track => [track.route, track]));
    const routes = songs.map(song => byRoute.get(song.route)).filter(Boolean);
    const sourceHashes = {};
    for (const relative of ['src/game/audio.ts', 'src/game/music-synth.ts', 'src/game/music-composer.ts', 'src/game/street/route-songs.ts', 'scripts/export-street-songs.mjs']) {
      sourceHashes[relative] = sha(await readFile(path.join(root, relative)));
    }
    const ffmpegVersion = (await command('ffmpeg', ['-version'])).stdout.toString().split('\n')[0];
    const updated = { ...manifest, catalogUpdatedAt: new Date().toISOString(),
      routeSongs: { source: "STREET_ROUTE_SONGS rendered through GameAudio in Chromium OfflineAudioContext, mastered as the routes' AAC",
        ffmpegVersion, chromiumVersion: browser.version(), sourceHashes },
      tracks: [...before, ...routes.map((track, offset) => ({ ...track, index: before.length + offset }))] };
    await writeFile(manifestPath, JSON.stringify(updated, null, 2) + '\n');
    process.stdout.write(`manifest: ${updated.tracks.length} tracks, route songs ${routes.map(track => track.file).join(', ')}\n`);
  }
} finally { await browser.close(); await server.close(); }
