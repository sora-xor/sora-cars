import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'public/assets/music/audio/manifest.json'), 'utf8'));
assert.equal(manifest.tracks.length, 26);
assert.ok(manifest.tracks.some(track => track.file === 'meet-me-at-yasukuni'));
const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${origin}/__soundtrack_playback`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Soundtrack decoder check</title><link rel="icon" href="data:,">' }));
  await page.goto(`${origin}/__soundtrack_playback`);
  const decoded = [];
  for (const track of manifest.tracks) {
    const result = await page.evaluate(async track => {
      const context = new AudioContext();
      const response = await fetch(track.preview.path), bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      const pcm = new Uint8Array(buffer.length * buffer.numberOfChannels * 4);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) pcm.set(new Uint8Array(buffer.getChannelData(channel).buffer), channel * buffer.length * 4);
      const pcmSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pcm))].map(value => value.toString(16).padStart(2, '0')).join('');
      let peak = 0, power = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) for (const sample of buffer.getChannelData(channel)) { peak = Math.max(peak, Math.abs(sample)); power += sample ** 2; }
      const full = document.createElement('audio'); full.preload = 'metadata'; full.src = track.mp3.path;
      const metadata = await new Promise((resolve, reject) => {
        full.onloadedmetadata = () => resolve({ durationSeconds: full.duration, canPlayMp3: full.canPlayType('audio/mpeg') });
        full.onerror = () => reject(new Error(`Cannot load ${track.mp3.path}`));
        document.body.append(full);
      });
      full.removeAttribute('src'); full.load(); full.remove(); await context.close();
      return { file: track.file, status: response.status, type: response.headers.get('content-type'), previewDurationSeconds: buffer.duration,
        channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, pcmSha256, peak, rms: Math.sqrt(power / (buffer.length * buffer.numberOfChannels)), ...metadata };
    }, track);
    assert.equal(result.status, 200); assert.match(result.type, /^audio\//);
    assert.equal(result.channels, 2); assert.ok(Math.abs(result.previewDurationSeconds - 30) < .05);
    assert.ok(result.peak > .1 && result.peak < 1); assert.ok(result.rms > .02);
    assert.ok(result.canPlayMp3); assert.ok(Math.abs(result.durationSeconds - track.durationSeconds) < .15);
    decoded.push(result);
  }
  assert.equal(decoded.length, manifest.tracks.length); assert.deepEqual(errors, []);
  assert.equal(new Set(decoded.map(track => track.pcmSha256)).size, manifest.tracks.length, 'every preview decodes to a different musical recording');
  await mkdir(path.join(root, 'output/audio/soundtrack'), { recursive: true });
  await writeFile(path.join(root, 'output/audio/soundtrack/browser-playback.json'), JSON.stringify({ generatedAt: new Date().toISOString(), chromiumVersion: browser.version(), decoded, errors }, null, 2) + '\n');
  console.log(`${decoded.length} MP3 previews decoded as audible stereo in Chromium; all complete MP3 durations loaded.`);
} finally { await browser.close(); await server.close(); }
