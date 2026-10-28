import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const output = 'output/audio/drive-synth';
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['src/game/audio.ts', 'scripts/test-audio.mjs'];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const { GameAudio } = await import('/src/game/audio.ts');
    const rate = 48000;
    function rms(data, from, to) {
      let sum = 0; const start = Math.floor(from * rate), end = Math.floor(to * rate);
      for (let index = start; index < end; index++) sum += data[index] ** 2;
      return Math.sqrt(sum / (end - start));
    }
    function peak(data, from, to) {
      let result = 0;
      for (let index = Math.floor(from * rate); index < Math.floor(to * rate); index++) result = Math.max(result, Math.abs(data[index]));
      return result;
    }
    // A first-difference RMS measures actual PCM high-frequency energy. It is
    // useful for comparing road-air brightness without exposing private nodes.
    function brightness(data, from, to) {
      let sum = 0; const start = Math.max(1, Math.floor(from * rate)), end = Math.floor(to * rate);
      for (let index = start; index < end; index++) sum += (data[index] - data[index - 1]) ** 2;
      return Math.sqrt(sum / (end - start));
    }
    async function render(duration, initial, events) {
      const ctx = new OfflineAudioContext(1, Math.floor(rate * duration), rate), audio = new GameAudio(ctx);
      audio.setVolumes(0, 0.8); initial(audio);
      const states = [{ time: 0, ...audio.driveState }];
      const pending = events.map(event => ctx.suspend(event.at).then(async () => {
        event.run(audio); states.push({ time: ctx.currentTime, ...audio.driveState }); await ctx.resume();
      }));
      const buffer = await ctx.startRendering(); await Promise.all(pending);
      const pcm = buffer.getChannelData(0).slice(); audio.dispose(); return { pcm, states };
    }
    const stop = await render(1.2, audio => audio.drive(600, true, true, { controls: 33 }), [
      { at: 0.3, run: audio => audio.drive(1100, true, false, { controls: 0 }) },
      { at: 0.33, run: audio => audio.stopDrive() },
    ]);
    const restart = await render(1, audio => audio.drive(1600, true, true, { controls: 33, offroad: true, rain: 1, lateral: 220 }), [
      { at: 0.3, run: audio => audio.drive(0, false) },
      { at: 0.6, run: audio => audio.drive(850, true, false, { controls: 1 }) },
    ]);
    const baseline = await render(0.8, audio => audio.drive(1600, true, false, { controls: 1 }), []);
    const gearTwo = await render(0.8, audio => audio.drive(900, true, false, { controls: 1 }), []);
    const gearThree = await render(0.8, audio => {
      audio.drive(950, true, false, { controls: 1 }); audio.drive(900, true, false, { controls: 1 });
    }, []);
    const boosted = await render(0.8, audio => audio.drive(1600, true, true, { controls: 33 }), []);
    const drift = await render(0.8, audio => audio.drive(1600, true, false, { controls: 17, lateral: 220 }), []);
    const rain = await render(0.8, audio => audio.drive(1600, true, false, { controls: 1, rain: 1, offroad: true }), []);
    const coastLow = await render(0.8, audio => audio.drive(740, true, false, { controls: 0 }), []);
    const coastFast = await render(0.8, audio => audio.drive(2400, true, false, { controls: 0 }), []);
    const coastMaximum = await render(0.8, audio => audio.drive(3300, true, false, { controls: 0 }), [
      { at: 0.6, run: audio => audio.stopDrive() },
    ]);
    function difference(a, b) {
      let sum = 0;
      for (let index = rate * 0.2; index < rate * 0.7; index++) sum += (a[index] - b[index]) ** 2;
      return Math.sqrt(sum / (rate * 0.5));
    }
    const collisionEvents = (kind, duplicate) => [
      { at: 0.2, run: audio => audio.drive(1300, true, false, { controls: 1, ...(kind ? { impact: { tick: 72, kind } } : {}) }) },
      ...[0.24, 0.28].map(at => ({ at, run: audio => audio.drive(1300, true, false, { controls: 1,
        ...(kind && duplicate ? { impact: { tick: 72, kind } } : {}) }) })),
      { at: 0.36, run: audio => audio.stopDrive() },
    ];
    const engineOnly = await render(0.8, audio => audio.drive(1300, true, false, { controls: 1 }), collisionEvents(null, false));
    const treeImpact = await render(0.8, audio => audio.drive(1300, true, false, { controls: 1 }), collisionEvents('tree', false));
    const signImpact = await render(0.8, audio => audio.drive(1300, true, false, { controls: 1 }), collisionEvents('sign', false));
    const repeatedImpact = await render(0.8, audio => audio.drive(1300, true, false, { controls: 1 }), collisionEvents('tree', true));
    const cue = await render(1, audio => audio.drive(900, true), [
      { at: 0.3, run: audio => { audio.stopDrive(); audio.cue('finish'); } },
    ]);
    const rampEvents = Array.from({ length: 120 }, (_, index) => {
      const at = (index + 1) * 0.045;
      return { at, run: audio => {
        const boost = at >= 2.4 && at < 3.3;
        const coast = at >= 3.3 && at < 3.75;
        audio.drive(Math.min(3000, at * 670), true, boost, { controls: coast ? 0 : 1 | (boost ? 32 : 0) | (at > 4 ? 16 : 0),
          lateral: at > 4 ? 220 : 20, offroad: at > 4.4 && at < 4.8, rain: at > 4.9 ? 0.7 : 0,
          ...(index === 39 ? { impact: { tick: 120, kind: 'tree' } } : index === 81 ? { impact: { tick: 246, kind: 'sign' } } : {}) });
      } };
    });
    rampEvents.push({ at: 5.6, run: audio => audio.stopDrive() });
    const ramp = await render(6.1, audio => audio.drive(0, true, false, { controls: 1 }), rampEvents);
    const stress = await render(0.5, audio => {
      for (let index = 0; index < 1000; index++) audio.drive(index % 3300, true, !!(index % 2), { controls: index % 64 });
    }, [{ at: 0.2, run: audio => audio.stopDrive() }]);
    function wav(data) {
      const bytes = new Uint8Array(44 + data.length * 2), view = new DataView(bytes.buffer);
      const text = (offset, value) => [...value].forEach((char, index) => bytes[offset + index] = char.charCodeAt(0));
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
      for (let index = 0; index < data.length; index++) view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, data[index])) * 32767), true);
      let binary = ''; for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
      return btoa(binary);
    }
    return {
      metrics: {
        runningRms: rms(stop.pcm, 0.1, 0.28), stopRms: rms(stop.pcm, 0.35, 1.2), stopPeak: peak(stop.pcm, 0.35, 1.2),
        queuedShiftAndTurbo: stop.states[1], stoppedState: stop.states[2],
        inactiveRms: rms(restart.pcm, 0.35, 0.58), resumedRms: rms(restart.pcm, 0.67, 0.95),
        baselineRms: rms(baseline.pcm, 0.2, 0.7), boostDifferenceRms: difference(baseline.pcm, boosted.pcm),
        coastLowRms: rms(coastLow.pcm, 0.2, 0.55), coastFastRms: rms(coastFast.pcm, 0.2, 0.55),
        coastLowBrightness: brightness(coastLow.pcm, 0.2, 0.55), coastFastBrightness: brightness(coastFast.pcm, 0.2, 0.55),
        coastMaximumPeak: peak(coastMaximum.pcm, 0.1, 0.55), coastMaximumStopRms: rms(coastMaximum.pcm, 0.65, 0.8),
        coastVoices: [coastLow.states[0].voiceCount, coastFast.states[0].voiceCount, coastMaximum.states[0].voiceCount],
        driftDifferenceRms: difference(baseline.pcm, drift.pcm), surfaceDifferenceRms: difference(baseline.pcm, rain.pcm),
        gearDifferenceRms: difference(gearTwo.pcm, gearThree.pcm), comparedGears: [gearTwo.states[0].gear, gearThree.states[0].gear],
        treeImpactDifferenceRms: difference(engineOnly.pcm, treeImpact.pcm), signImpactDifferenceRms: difference(engineOnly.pcm, signImpact.pcm),
        impactKindDifferenceRms: difference(treeImpact.pcm, signImpact.pcm), duplicateImpactDifferenceRms: difference(treeImpact.pcm, repeatedImpact.pcm),
        impactStopRms: Math.max(rms(treeImpact.pcm, 0.4, 0.8), rms(signImpact.pcm, 0.4, 0.8)),
        impactKinds: [treeImpact.states[1].impact, signImpact.states[1].impact],
        finishCueRms: rms(cue.pcm, 0.4, 0.8), finishDriveState: cue.states[1],
        rampPeak: peak(ramp.pcm, 0, 6.1), rampStopRms: rms(ramp.pcm, 5.65, 6.1),
        gears: [...new Set(ramp.states.map(state => state.gear))],
        voiceCounts: [...new Set([...ramp.states, ...stress.states].map(state => state.voiceCount))],
        stressStopRms: rms(stress.pcm, 0.25, 0.5),
      }, states: ramp.states, wav: wav(ramp.pcm),
    };
  });
  const m = result.metrics;
  assert.ok(m.runningRms > 0.01 && m.baselineRms > 0.01, 'actual rendered engine PCM is audible');
  assert.ok(m.coastFastBrightness > m.coastLowBrightness * 3,
    'Actual 259 km/h coasting has substantially stronger air/road brightness than 80 km/h without throttle or boost');
  assert.ok(m.coastMaximumPeak < 0.98, 'Maximum-speed road air retains waveform headroom');
  assert.equal(m.coastMaximumStopRms, 0, 'Maximum-speed road air stops exactly with the driving bus');
  assert.ok(m.coastVoices.every(count => count === m.voiceCounts[0]), 'Speed-dependent road air reuses the fixed voice bank');
  assert.equal(m.queuedShiftAndTurbo.shifting, true); assert.equal(m.queuedShiftAndTurbo.turboRelease, true);
  assert.equal(m.stopRms, 0); assert.equal(m.stopPeak, 0, 'queued engine/turbo tails cannot reopen stopped drive bus');
  assert.equal(m.stoppedState.active, false); assert.equal(m.inactiveRms, 0); assert.ok(m.resumedRms > 0.01);
  for (const key of ['boostDifferenceRms', 'driftDifferenceRms', 'surfaceDifferenceRms', 'gearDifferenceRms']) assert.ok(m[key] > 0.001, `${key} materially changes rendered audio`);
  for (const key of ['treeImpactDifferenceRms', 'signImpactDifferenceRms', 'impactKindDifferenceRms']) assert.ok(m[key] > 0.001, `${key} materially changes rendered collision audio`);
  // Separate Web Audio renders may differ below Float32 precision. A repeated
  // audible transient is many orders of magnitude larger than this -140dBFS bound.
  assert.ok(m.duplicateImpactDifferenceRms < 1e-7, '60Hz observations cannot replay one 30Hz collision');
  assert.equal(m.impactStopRms, 0); assert.deepEqual(m.impactKinds, ['tree', 'sign']);
  assert.deepEqual(m.comparedGears, [2, 3], 'same speed in different gears produces different rendered engine notes');
  assert.equal(m.finishDriveState.active, false); assert.ok(m.finishCueRms > 0.01, 'finish cue remains independent of stopped drive bus');
  assert.deepEqual(m.gears, [1, 2, 3, 4, 5, 6]); assert.ok(m.rampPeak < 0.98, 'driving waveform retains headroom');
  assert.equal(m.voiceCounts.length, 1, 'thousands of updates reuse one fixed voice bank');
  assert.equal(m.rampStopRms, 0); assert.equal(m.stressStopRms, 0); assert.deepEqual(errors, []);
  await writeFile(`${output}/engine-road-demo.wav`, Buffer.from(result.wav, 'base64'));
  for (const [path, digest] of Object.entries(sources)) assert.equal(hash(await readFile(path)), digest, `source changed during audio render: ${path}`);
  await writeFile(`${output}/report.json`, JSON.stringify({ sampleRate: 48000, sources, ...m, states: result.states }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, ...m, audio: `${output}/engine-road-demo.wav` }, null, 2));
} finally { await browser.close(); }
