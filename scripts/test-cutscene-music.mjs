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
    async function render(seconds, initial, events = [], inspectSchedule = false, chunk = 0) {
      const ctx = new OfflineAudioContext(1, rate * seconds, rate), audio = new GameAudio(ctx);
      // Observe every note the transport actually schedules, drums included.
      const scheduled = [];
      if (inspectSchedule) audio.onNote = (note, at) => scheduled.push({ channel: note.channel, pitch: note.pitch, at });
      // With a chunk, notes are queued only a moment ahead, as the live 30 ms timer does,
      // so a transition sees the same partly scheduled music it meets in the game.
      const ahead = at => chunk ? Math.min(seconds - at, chunk + .15) : seconds - at;
      audio.musicEnabled = true; audio.setVolumes(.75, 0); initial(audio); audio.scheduleOfflineMusic(ahead(0));
      const states = [{ at: 0, ...audio.musicState }];
      const pending = events.map(event => ctx.suspend(event.at).then(async () => {
        event.run(audio); audio.scheduleOfflineMusic(ahead(ctx.currentTime));
        states.push({ at: ctx.currentTime, ...audio.musicState }); await ctx.resume();
      }));
      const frame = at => Math.round(at * rate / 128), taken = new Set(events.map(event => frame(event.at)));
      for (let step = 1; chunk && step * chunk < seconds - .2; step++) {
        if (taken.has(frame(step * chunk))) continue;
        pending.push(ctx.suspend(step * chunk).then(async () => { audio.scheduleOfflineMusic(ahead(ctx.currentTime)); await ctx.resume(); }));
      }
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
        if (at > seconds) continue;
        expected.push({ channel: note.channel, pitch: note.pitch, at });
      }
      return { count: result.scheduled.length, expectedCount: expected.length,
        exact: result.scheduled.length === expected.length && result.scheduled.every((note, index) => note.channel === expected[index].channel && note.pitch === expected[index].pitch && Math.abs(note.at - expected[index].at) < 1e-8),
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
    // Story transitions, each measured against the same music crossfaded normally, so only the transition differs.
    const level = (pcm, from, to) => metrics(pcm, from, to).rms;
    // Level in one band through an RBJ band-pass filter, settled for 0.1 s before the window.
    function band(pcm, from, to, frequency) {
      const w = 2 * Math.PI * frequency / rate, cos = Math.cos(w), alpha = Math.sin(w) / 2.4, a0 = 1 + alpha;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, power = 0;
      for (let i = Math.max(0, Math.floor(from * rate) - 2400); i < Math.floor(to * rate); i++) {
        const x = pcm[i], y = (alpha * x - alpha * x2 + 2 * cos * y1 - (1 - alpha) * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y; if (i >= from * rate) power += y * y;
      }
      return Math.sqrt(power / ((to - from) * rate));
    }
    const treble = (pcm, from, to) => band(pcm, from, to, 2500) / band(pcm, from, to, 400);
    const umbrella = cue(4, 'victory', 4, 'radio', 'right'), deadAir = cue(6, 'victory', 0, 'radio', 'wide');
    const quiet = transition => ({ ...deadAir, key: `quiet-${transition}`, transition });
    const live = .1;
    const toCut = await render(4, audio => audio.setCutsceneCue(umbrella), [{ at: 2, run: audio => audio.setCutsceneCue(quiet('cut')) }], false, live);
    const toFade = await render(4, audio => audio.setCutsceneCue(umbrella), [{ at: 2, run: audio => audio.setCutsceneCue(quiet('fade')) }], false, live);
    const relay = cue(6, 'intro', 13, 'garage', 'wide');
    const powerdown = await render(6, audio => audio.setCutsceneCue(relay), [{ at: 3, run: audio => audio.setCutsceneCue(deadAir) }], false, live);
    const plainOut = await render(6, audio => audio.setCutsceneCue(relay), [{ at: 3, run: audio => audio.setCutsceneCue(quiet('fade')) }], false, live);
    const betrayal = cue(6, 'victory', 2, 'radio', 'right');
    const swell = await render(6, audio => audio.setCutsceneCue(deadAir), [{ at: 1, run: audio => audio.setCutsceneCue(betrayal) }], false, live);
    const plainIn = await render(6, audio => audio.setCutsceneCue(deadAir), [{ at: 1, run: audio => audio.setCutsceneCue({ ...betrayal, key: 'betrayal-fade', transition: 'fade' }) }], false, live);
    // Ren's silence: Jun's song must keep playing while it fades, not stop where the cue changed.
    const recordedQuiet = cue(11, 'victory', 5, 'sunrise', 'right');
    const keepPlaying = await render(9, audio => audio.setCutsceneCue(premiereCue), [], false, live);
    const fadeOut = await render(9, audio => audio.setCutsceneCue(premiereCue), [{ at: 6, run: audio => audio.setCutsceneCue(recordedQuiet) }], false, live);
    const transitions = {
      fadeOut: { natural: level(keepPlaying.pcm, 6, 6.5), early: level(fadeOut.pcm, 6, 6.5), naturalMid: level(keepPlaying.pcm, 7, 7.5), mid: level(fadeOut.pcm, 7, 7.5),
        end: level(fadeOut.pcm, 8.7, 9), states: fadeOut.states },
      cut: { before: level(toCut.pcm, 1.4, 1.9), after: level(toCut.pcm, 2.1, 2.5), crossfadeAfter: level(toFade.pcm, 2.1, 2.5), states: toCut.states },
      // Treble against mids, so the two different gain ramps do not decide the comparison.
      powerdown: { before: level(powerdown.pcm, 2.4, 2.9), treble: treble(powerdown.pcm, 3.15, 3.45), crossfadeTreble: treble(plainOut.pcm, 3.15, 3.45),
        deadAir: level(powerdown.pcm, 4.6, 5.6), states: powerdown.states },
      swell: { early: level(swell.pcm, 1.3, 1.8), crossfadeEarly: level(plainIn.pcm, 1.3, 1.8), late: level(swell.pcm, 4.4, 5.4), crossfadeLate: level(plainIn.pcm, 4.4, 5.4), states: swell.states },
    };
    // A listening sequence: the phone call cuts in, the broadcast powers down, the betrayal creeps
    // in, Jun's premiere ends in Ren's silence, and the love theme answers Aki.
    const story = await render(32, audio => audio.setCutsceneCue(umbrella), [
      { at: 4, run: audio => audio.setCutsceneCue(cue(4, 'victory', 5, 'boardroom', 'right')) },
      { at: 9, run: audio => audio.setCutsceneCue(deadAir) },
      { at: 12, run: audio => audio.setCutsceneCue(betrayal) },
      { at: 18, run: audio => audio.setCutsceneCue(cue(11, 'victory', 3, 'radio', 'wide')) },
      { at: 24, run: audio => audio.setCutsceneCue(cue(11, 'victory', 5, 'sunrise', 'right')) },
      { at: 27.5, run: audio => audio.setCutsceneCue(cue(11, 'victory', 6, 'sunrise', 'left')) },
    ], false, live);
    const external = await render(4, audio => audio.setCutsceneCue(wide), [{ at: 1.5, run: audio => audio.setExternalMusic(true) }]);
    const muted = await render(4, audio => audio.setCutsceneCue(wide), [{ at: 1.5, run: audio => { audio.musicEnabled = false; audio.setVolumes(.75, 0); } }]);
    return { songs, angle: { differenceRms: Math.sqrt(changed / (rate * 1.2)), states: angle.states },
      entrances: { requested: premiereCue.entryBeat, differenceRms: Math.sqrt(entranceDifference / (rate * 7)),
        premiere: { wav: wav(premiere.pcm), ...metrics(premiere.pcm), states: premiere.states, schedule: checkSchedule(premiere, premiereCue, 8) },
        cameraStates: developedAngle.states, wrap: { ...metrics(tail.pcm), schedule: checkSchedule(tail, tailCue, 5) } },
      demo: { wav: wav(demo.pcm), ...metrics(demo.pcm), states: demo.states,
        cuts: demo.states.slice(1).map(state => ({ at: state.at, ...metrics(demo.pcm, state.at, state.at + .01) })) },
      transitions, story: { wav: wav(story.pcm), ...metrics(story.pcm), states: story.states,
        cuts: story.states.slice(1).map(state => ({ at: state.at, ...metrics(story.pcm, state.at, state.at + .01) })) },
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
  const { cut, powerdown, swell, fadeOut } = report.transitions;
  assert.ok(fadeOut.early > fadeOut.natural * .75, 'a slow fade-out keeps the song playing as it starts to fade');
  assert.ok(fadeOut.mid > fadeOut.naturalMid * .3 && fadeOut.mid < fadeOut.naturalMid * .75, 'halfway through, the song is still there at a lower level');
  assert.ok(fadeOut.end < fadeOut.natural * .05, 'and then the silence is real');
  assert.ok(cut.after < cut.crossfadeAfter * .5 && cut.after < cut.before * .3, 'a cut removes the old song at once, unlike a crossfade');
  assert.ok(powerdown.treble < powerdown.crossfadeTreble * .5, 'a power-down loses its top end as it dies');
  assert.ok(powerdown.deadAir < powerdown.before * .1, 'dead air follows the power-down');
  assert.deepEqual(powerdown.states.map(state => state.silent), [false, true]);
  assert.ok(swell.early < swell.crossfadeEarly * .5, 'a slow transition swells in instead of arriving at once');
  assert.ok(Math.abs(swell.late / swell.crossfadeLate - 1) < .1, 'once swelled in, the song plays at its normal level');
  assert.ok(report.story.peak < .95, 'story transitions stay below clipping');
  assert.ok(report.story.cuts.every(transition => transition.maxStep < .15), 'even a cut has no click at the cue boundary');
  assert.equal(report.externalPeak, 0, 'external course music closes every score path, including scheduled tails');
  assert.ok(report.mutedPeak < 1e-8, 'mute closes original music after its short gain ramp');
  await writeFile(`${output}/adaptive-score-demo.wav`, Buffer.from(report.demo.wav, 'base64')); delete report.demo.wav;
  await writeFile(`${output}/story-transitions-demo.wav`, Buffer.from(report.story.wav, 'base64')); delete report.story.wav;
  await writeFile(`${output}/jun-premiere-developed.wav`, Buffer.from(report.entrances.premiere.wav, 'base64')); delete report.entrances.premiere.wav;
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, ...report, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ songs: report.songs.length, angleDifferenceRms: report.angle.differenceRms, developedEntranceDifferenceRms: report.entrances.differenceRms, premiereScheduledNotes: report.entrances.premiere.schedule.count, demoPeak: report.demo.peak, externalPeak: report.externalPeak, mutedPeak: report.mutedPeak, output }));
} finally { await browser.close(); }
