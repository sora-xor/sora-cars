import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Render the actual game synthesizer once through every written 64-bar score.
// No MIDI player, surrogate oscillator bank, game canvas or driving SFX is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public/assets/music/audio');
const evidence = path.join(root, 'output/audio/soundtrack');
const sampleRate = 44100, channels = 2, tailSeconds = 1, targetLufs = -16, ceilingDbtp = -1.5;
const requested = process.argv.find(argument => argument.startsWith('--track='))?.slice(8);
await mkdir(destination, { recursive: true }); await mkdir(evidence, { recursive: true });
function command(binary, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { cwd: root }); const chunks = [], errors = [];
    process.stdout.on('data', chunk => chunks.push(chunk)); process.stderr.on('data', chunk => errors.push(chunk));
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve({ stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors).toString() }) : reject(new Error(`${binary} exited ${code}: ${Buffer.concat(errors)}`)));
  });
}
const ffmpegVersion = (await command('ffmpeg', ['-version'])).stdout.toString().split('\n')[0];
async function loudness(file) {
  const result = await command('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', `loudnorm=I=${targetLufs}:TP=${ceilingDbtp}:LRA=11:print_format=json`, '-f', 'null', '-']);
  const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  assert.ok(match, `loudness measurements available for ${file}`);
  const measurement = JSON.parse(match[0]);
  return { integratedLufs: Number(measurement.input_i), truePeakDbtp: Number(measurement.input_tp), loudnessRangeLu: Number(measurement.input_lra) };
}
async function fileInfo(file) {
  const buffer = await readFile(file);
  return { path: `/assets/music/audio/${path.basename(file)}`, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
}
async function inspect(file, expectedSeconds) {
  const probe = JSON.parse((await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout.toString());
  const stream = probe.streams[0];
  assert.equal(stream.channels, channels); assert.equal(Number(stream.sample_rate), sampleRate);
  assert.ok(Math.abs(Number(probe.format.duration) - expectedSeconds) < .12, `${file} contains the entire composition`);
  const decoded = (await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])).stdout;
  let peak = 0, power = 0, difference = 0, nonFinite = 0, lastPeak = 0;
  const sections = Array.from({ length: 8 }, () => ({ power: 0, count: 0 }));
  for (let offset = 0; offset < decoded.length; offset += 4) {
    const value = decoded.readFloatLE(offset);
    if (!Number.isFinite(value)) nonFinite++;
    peak = Math.max(peak, Math.abs(value)); power += value ** 2;
    const section = sections[Math.min(7, Math.floor(offset / decoded.length * 8))]; section.power += value ** 2; section.count++;
    if (offset % 8 === 0) difference += (value - decoded.readFloatLE(offset + 4)) ** 2;
    if (offset >= decoded.length - sampleRate * channels * 4 / 10) lastPeak = Math.max(lastPeak, Math.abs(value));
  }
  const rms = Math.sqrt(power / (decoded.length / 4)), stereoDifferenceRms = Math.sqrt(difference / (decoded.length / 8));
  const sectionRms = sections.map(section => Math.sqrt(section.power / section.count));
  assert.equal(nonFinite, 0, `${file} has finite samples`);
  assert.ok(peak > .1 && peak < 1, `${file} is audible without digital clipping`);
  assert.ok(rms > .02, `${file} has musical energy`);
  assert.ok(stereoDifferenceRms > .002, `${file} has stereo instrumentation`);
  assert.ok(sectionRms.every(value => value > .003), `${file} carries musical audio through all eight sections`);
  assert.ok(lastPeak < .0001, `${file} ends in silence after the release tail`);
  return { codec: stream.codec_name, durationSeconds: Number(probe.format.duration), peak, rms, stereoDifferenceRms, sectionRms, last100msPeak: lastPeak, finite: true, decodedFrames: decoded.length / 8 };
}

const server = await createServer({ root, server: { port: 0, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const address = server.httpServer.address(), origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], tracks = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/__soundtrack_export`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>SORA original soundtrack export</title><link rel="icon" href="data:,">' }));
  await page.goto(`${origin}/__soundtrack_export`);
  const library = await page.evaluate(async () => (await import('/src/game/music-score.ts')).MUSIC_LIBRARY);
  const selected = library.map((track, index) => ({ ...track, index })).filter(track => requested === undefined || track.file === requested || String(track.index) === requested);
  assert.ok(selected.length, 'requested soundtrack composition exists');
  for (const track of selected) {
    const download = page.waitForEvent('download', { timeout: 300000 });
    const render = await page.evaluate(async ({ index, sampleRate, tailSeconds }) => {
      const { GameAudio } = await import('/src/game/audio.ts');
      const { makeScore } = await import('/src/game/music-score.ts');
      const score = makeScore(index), scoreSeconds = score.beats * 60 / score.bpm, startSeconds = .08;
      const context = new OfflineAudioContext(2, Math.ceil((startSeconds + scoreSeconds + tailSeconds) * sampleRate), sampleRate);
      const audio = new GameAudio(context); audio.musicEnabled = true; audio.setVolumes(.75, 0); audio.setTrack(index);
      // Stop scheduling before the first note of the next loop. Release envelopes
      // continue into the extra second, with the entire 64-bar score represented.
      const lastOnset = startSeconds + scoreSeconds - 1 / sampleRate, windowSeconds = 8;
      audio.scheduleOfflineMusic(Math.min(windowSeconds, lastOnset));
      // Short scheduling windows let ended voices disconnect before processing
      // the next phrase, rather than keeping thousands of future voices live.
      const windows = [];
      for (let at = windowSeconds; at < lastOnset; at += windowSeconds) {
        windows.push(context.suspend(at).then(async () => {
          audio.scheduleOfflineMusic(Math.min(windowSeconds, lastOnset - context.currentTime));
          await context.resume();
        }));
      }
      const buffer = await context.startRendering(); await Promise.all(windows); audio.dispose();
      const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
      const fadeStartSeconds = startSeconds + (score.beats - 32) * 60 / score.bpm;
      const fadeEndSeconds = startSeconds + scoreSeconds + .5;
      // A slow eight-bar album fade, then half a second for the final releases.
      // Smoothstep has zero slope at both boundaries and introduces no click.
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
      return { bars: score.beats / 4, beats: score.beats, noteCount: score.notes.length, durationSeconds: buffer.length / sampleRate, scoreSeconds, fadeStartSeconds, fadeEndSeconds };
    }, { index: track.index, sampleRate, tailSeconds });
    const raw = path.join(evidence, `${track.file}-render-f32.wav`);
    await (await download).saveAs(raw);
    const before = await loudness(raw);
    const gainDb = Math.min(targetLufs - before.integratedLufs, ceilingDbtp - before.truePeakDbtp);
    assert.ok(Number.isFinite(gainDb), `${track.file} loudness can be mastered`);
    const wav = path.join(destination, `${track.file}.wav`), mp3 = path.join(destination, `${track.file}.mp3`), preview = path.join(destination, `${track.file}-preview.mp3`);
    const tags = ['-metadata', `title=${track.name}`, '-metadata', 'artist=SORA CARS', '-metadata', 'album=SORA CARS — Original Soundtrack', '-metadata', `track=${track.index + 1}/25`, '-metadata', 'date=2026', '-metadata', 'genre=Electronic'];
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', raw, '-af', `volume=${gainDb.toFixed(6)}dB,aresample=dither_method=triangular`, '-c:a', 'pcm_s16le', '-ar', String(sampleRate), '-ac', '2', ...tags, wav]);
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', String(sampleRate), '-id3v2_version', '3', ...tags, mp3]);
    const previewStartSeconds = .08 + 32 * 60 / track.bpm;
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(previewStartSeconds), '-i', wav, '-t', '30', '-af', 'afade=t=in:st=0:d=0.3,afade=t=out:st=27.3:d=2.5', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(sampleRate), ...tags, preview]);
    const wavInspection = await inspect(wav, render.durationSeconds), mp3Inspection = await inspect(mp3, render.durationSeconds);
    const previewInspection = await inspect(preview, 30), after = await loudness(wav);
    assert.ok(after.truePeakDbtp <= -1.35, `${track.file} retains mastering headroom`);
    const entry = { index: track.index, file: track.file, title: track.name, japanese: track.japanese, bpm: track.bpm,
      ...render, sampleRate, channels, bitsPerSample: 16, ...after, peak: wavInspection.peak, rms: wavInspection.rms,
      wav: await fileInfo(wav), mp3: await fileInfo(mp3), preview: { ...await fileInfo(preview), durationSeconds: 30, startSeconds: previewStartSeconds },
      mastering: { gainDb, targetLufs, ceilingDbtp, input: before, ending: 'Eight-bar album fade with natural release tail; no additional loop.' },
    };
    tracks.push(entry);
    await rm(raw);
    await writeFile(path.join(evidence, `${track.file}.json`), JSON.stringify({ ...entry, validation: { wav: wavInspection, mp3: mp3Inspection, preview: previewInspection } }, null, 2) + '\n');
    process.stdout.write(`${String(track.index + 1).padStart(2, '0')}/25 ${track.name}: ${render.durationSeconds.toFixed(2)}s; ${after.integratedLufs} LUFS; ${after.truePeakDbtp} dBTP\n`);
    // Release graph/PCM memory between full-length offline renders.
    await page.reload();
  }
  assert.deepEqual(errors, []);
  assert.equal(new Set(tracks.map(track => track.wav.sha256)).size, tracks.length, 'every composition produces distinct PCM');
  const sourceHashes = {};
  for (const relative of ['src/game/audio.ts', 'src/game/music-score.ts', 'src/game/music-themes.ts', 'src/game/music-cues.ts', 'scripts/export-soundtrack.mjs']) {
    sourceHashes[relative] = createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
  }
  const manifest = { schema: 'sora-cars-soundtrack-audio-v1', generatedAt: new Date().toISOString(), source: 'Original MUSIC_LIBRARY scores rendered through GameAudio in Chromium OfflineAudioContext',
    sampleRate, channels, ffmpegVersion, chromiumVersion: browser.version(), sourceHashes, tracks };
  await writeFile(path.join(evidence, requested === undefined ? 'report.json' : `report-${requested}.json`), JSON.stringify({ ...manifest, browserErrors: errors, totalBytes: tracks.reduce((total, track) => total + track.wav.bytes + track.mp3.bytes + track.preview.bytes, 0) }, null, 2) + '\n');
  // A single-track audition must never silently replace the complete catalog.
  if (requested === undefined) { assert.equal(tracks.length, library.length); await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'); }
} finally { await browser.close(); await server.close(); }
