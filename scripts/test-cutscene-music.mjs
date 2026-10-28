import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const output = 'output/audio/cutscene-score';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Exercise the actual audio modules without loading the unrelated 3D world.
  await page.route(`${origin}/`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Cutscene score audio validation</title>' }));
  await page.goto(origin);
  const report = await page.evaluate(async () => {
    const { GameAudio } = await import('/src/game/audio.ts');
    const { MUSIC_LIBRARY, makeScore } = await import('/src/game/music-score.ts');
    const { resolveCutsceneCue } = await import('/src/game/music-cues.ts');
    const rate = 24000;
    function wav(pcm) {
      const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
      const text = (offset, value) => [...value].forEach((letter, index) => bytes[offset + index] = letter.charCodeAt(0));
      text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
      pcm.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
      let encoded = ''; for (let i = 0; i < bytes.length; i += 8192) encoded += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(encoded);
    }
    function metrics(pcm, from = .9, to = pcm.length / rate) {
      const start = Math.floor(from * rate), end = Math.floor(to * rate); let peak = 0, power = 0, delta = 0;
      for (let i = start; i < end; i++) { peak = Math.max(peak, Math.abs(pcm[i])); power += pcm[i] ** 2; if (i) delta = Math.max(delta, Math.abs(pcm[i] - pcm[i - 1])); }
      return { peak, rms: Math.sqrt(power / (end - start)), maxStep: delta };
    }
    async function render(seconds, initial, events = [], inspectSchedule = false) {
      const ctx = new OfflineAudioContext(1, rate * seconds, rate), audio = new GameAudio(ctx);
      // Observe real oscillator scheduling after the unrelated driving bank is built.
      // Each pitched note schedules its carrier frequency; kicks schedule 130 Hz.
      const scheduled = [];
      if (inspectSchedule) {
        const createOscillator = ctx.createOscillator.bind(ctx);
        ctx.createOscillator = () => {
          const oscillator = createOscillator(), setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
          oscillator.frequency.setValueAtTime = (frequency, at) => { scheduled.push({ frequency, at }); return setFrequency(frequency, at); };
          return oscillator;
        };
      }
      audio.musicEnabled = true; audio.setVolumes(.75, 0); initial(audio); audio.scheduleOfflineMusic(seconds);
      const states = [{ at: 0, ...audio.musicState }];
      const pending = events.map(event => ctx.suspend(event.at).then(async () => {
        event.run(audio); audio.scheduleOfflineMusic(seconds - ctx.currentTime);
        states.push({ at: ctx.currentTime, ...audio.musicState }); await ctx.resume();
      }));
      const buffer = await ctx.startRendering(); await Promise.all(pending);
      const pcm = buffer.getChannelData(0).slice(); audio.dispose(); return { pcm, states, scheduled };
    }
    const songs = [];
    for (let track = 9; track < MUSIC_LIBRARY.length; track++) {
      const { pcm } = await render(12, audio => audio.setTrack(track));
      songs.push({ file: MUSIC_LIBRARY[track].file, title: MUSIC_LIBRARY[track].name, ...metrics(pcm), wav: wav(pcm) });
    }
    const cue = (chapter, phase, line, scene, shot) => resolveCutsceneCue(chapter, phase, line, { scene, shot });
    const wide = cue(0, 'intro', 0, 'garage', 'wide'), left = cue(0, 'intro', 1, 'garage', 'left');
    const steady = await render(4, audio => audio.setCutsceneCue(wide));
    const angle = await render(4, audio => audio.setCutsceneCue(wide), [{ at: 2, run: audio => audio.setCutsceneCue(left) }]);
    let changed = 0; for (let i = rate * 2.6; i < rate * 3.8; i++) changed += (angle.pcm[i] - steady.pcm[i]) ** 2;
    const premiereCue = cue(11, 'victory', 3, 'radio', 'wide');
    const premiere = await render(8, audio => audio.setCutsceneCue(premiereCue), [], true);
    const opening = await render(8, audio => audio.setCutsceneCue({ ...premiereCue, entryBeat: 0 }));
    let entranceDifference = 0;
    for (let i = rate; i < rate * 8; i++) entranceDifference += (premiere.pcm[i] - opening.pcm[i]) ** 2;
    const developedAngle = await render(4, audio => audio.setCutsceneCue(premiereCue), [
      { at: 2, run: audio => audio.setCutsceneCue(cue(11, 'victory', 4, 'radio', 'left')) },
    ]);
    const tailCue = { ...premiereCue, key: 'tail-wrap-check', entryBeat: 252 };
    const tail = await render(5, audio => audio.setCutsceneCue(tailCue), [], true);
    function checkSchedule(result, musicCue, seconds) {
      const score = makeScore(musicCue.track), beatDuration = 60 / score.bpm, expected = [];
      for (let loop = 0; loop < 2; loop++) for (const note of score.notes) {
        if (loop === 0 && note.beat < musicCue.entryBeat) continue;
        const at = .08 + (loop * score.beats + note.beat - musicCue.entryBeat) * beatDuration;
        if (at > seconds || note.channel === 9 && note.pitch !== 36) continue;
        expected.push({ frequency: note.channel === 9 ? 130 : 440 * 2 ** ((note.pitch - 69) / 12), at });
      }
      return { count: result.scheduled.length, expectedCount: expected.length,
        exact: result.scheduled.length === expected.length && result.scheduled.every((note, index) => Math.abs(note.frequency - expected[index].frequency) < 1e-8 && Math.abs(note.at - expected[index].at) < 1e-8),
        firstAt: result.scheduled[0]?.at, firstExpectedAt: expected[0]?.at };
    }
    const demo = await render(28, audio => audio.setCutsceneCue(wide), [
      { at: 3, run: audio => audio.setCutsceneCue(left) },
      { at: 6, run: audio => audio.setCutsceneCue(cue(0, 'intro', 3, 'ledger', 'wide')) },
      { at: 10, run: audio => audio.setCutsceneCue(cue(4, 'intro', 6, 'radio', 'left')) },
      { at: 14, run: audio => audio.setCutsceneCue(cue(6, 'victory', 3, 'radio', 'left')) },
      { at: 18, run: audio => audio.setCutsceneCue(cue(11, 'victory', 3, 'radio', 'wide')) },
      { at: 23, run: audio => audio.setCutsceneCue(cue(11, 'victory', 7, 'sunrise', 'right')) },
    ]);
    const external = await render(4, audio => audio.setCutsceneCue(wide), [{ at: 1.5, run: audio => audio.setExternalMusic(true) }]);
    const muted = await render(4, audio => audio.setCutsceneCue(wide), [{ at: 1.5, run: audio => { audio.musicEnabled = false; audio.setVolumes(.75, 0); } }]);
    return { songs, angle: { differenceRms: Math.sqrt(changed / (rate * 1.2)), states: angle.states },
      entrances: { requested: premiereCue.entryBeat, differenceRms: Math.sqrt(entranceDifference / (rate * 7)),
        premiere: { wav: wav(premiere.pcm), ...metrics(premiere.pcm), states: premiere.states, schedule: checkSchedule(premiere, premiereCue, 8) },
        cameraStates: developedAngle.states, wrap: { ...metrics(tail.pcm), schedule: checkSchedule(tail, tailCue, 5) } },
      demo: { wav: wav(demo.pcm), ...metrics(demo.pcm), states: demo.states,
        cuts: demo.states.slice(1).map(state => ({ at: state.at, ...metrics(demo.pcm, state.at, state.at + .01) })) },
      externalPeak: metrics(external.pcm, 1.8).peak, mutedPeak: metrics(muted.pcm, 2.4).peak };
  });
  const hashes = new Set();
  for (const song of report.songs) {
    const bytes = Buffer.from(song.wav, 'base64'); delete song.wav;
    song.sha256 = createHash('sha256').update(bytes).digest('hex'); hashes.add(song.sha256);
    assert.ok(song.rms > .008 && song.peak < .95, `${song.file} is audible and unclipped`);
    await writeFile(`${output}/${song.file}.wav`, bytes);
  }
  assert.equal(hashes.size, 16);
  assert.ok(report.angle.differenceRms > .002, 'a camera cut changes actual PCM, not only metadata');
  assert.equal(report.angle.states[0].startedAt, report.angle.states[1].startedAt, 'angle holds score transport');
  assert.equal(report.angle.states[0].transitions, report.angle.states[1].transitions, 'angle never restarts the song');
  assert.equal(report.entrances.requested, 192);
  assert.ok(report.entrances.differenceRms > .005, 'the developed phrase changes actual audio from the opening');
  assert.ok(report.entrances.premiere.schedule.exact, 'only notes at and after the authored entrance are scheduled');
  assert.ok(report.entrances.wrap.schedule.exact, 'a late entrance wraps at the score boundary into the full opening');
  assert.ok(report.entrances.premiere.rms > .008 && report.entrances.premiere.peak < .95, 'the completed premiere is audible and unclipped');
  assert.ok(report.entrances.wrap.rms > .008 && report.entrances.wrap.peak < .95, 'the late entrance survives its first loop');
  const [beforeAngle, afterAngle] = report.entrances.cameraStates;
  assert.equal(beforeAngle.entryBeat, 192); assert.equal(afterAngle.entryBeat, 192);
  assert.equal(beforeAngle.startedAt, afterAngle.startedAt); assert.equal(beforeAngle.transitions, afterAngle.transitions);
  assert.ok(afterAngle.transportBeat > beforeAngle.transportBeat, 'a camera cut continues through the developed phrase');
  assert.ok(report.demo.peak < .95, 'crossfades stay below clipping');
  assert.ok(report.demo.cuts.every(cut => cut.maxStep < .15), 'cue boundaries have no abrupt full-level step');
  assert.equal(report.externalPeak, 0, 'external course music closes every score path, including scheduled tails');
  assert.ok(report.mutedPeak < 1e-8, 'mute closes original music after its short gain ramp');
  await writeFile(`${output}/adaptive-score-demo.wav`, Buffer.from(report.demo.wav, 'base64')); delete report.demo.wav;
  await writeFile(`${output}/jun-premiere-developed.wav`, Buffer.from(report.entrances.premiere.wav, 'base64')); delete report.entrances.premiere.wav;
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, ...report, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ songs: report.songs.length, angleDifferenceRms: report.angle.differenceRms, developedEntranceDifferenceRms: report.entrances.differenceRms, premiereScheduledNotes: report.entrances.premiere.schedule.count, demoPeak: report.demo.peak, externalPeak: report.externalPeak, mutedPeak: report.mutedPeak, output }));
} finally { await browser.close(); }
