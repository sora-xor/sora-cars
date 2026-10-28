import { writeFileSync, mkdirSync } from 'node:fs';
import { makeScore, MUSIC_LIBRARY } from '../src/game/music-score.ts';

const bytes = (...v) => Buffer.from(v.flat());
const u32 = n => bytes((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const vlq = value => { let n = value, out = [n & 127]; while ((n >>>= 7)) out.unshift((n & 127) | 128); return out; };
function chunk(id, content) { return Buffer.concat([Buffer.from(id), u32(content.length), content]); }
function track(events) {
  events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  let last = 0;
  const data = events.flatMap(e => { const out = [...vlq(e.tick - last), ...e.data]; last = e.tick; return out; });
  return chunk('MTrk', bytes(data, 0, 255, 47, 0));
}
mkdirSync('public/assets/music', { recursive: true });
for (let i = 0; i < MUSIC_LIBRARY.length; i++) {
  const score = makeScore(i), tempo = Math.round(60_000_000 / score.bpm), title = Buffer.from(score.name);
  const tracks = [track([
    { tick: 0, priority: 0, data: [255, 3, title.length, ...title] },
    { tick: 0, priority: 0, data: [255, 81, 3, tempo >>> 16, (tempo >>> 8) & 255, tempo & 255] },
    { tick: 0, priority: 0, data: [255, 88, 4, 4, 2, 24, 8] },
  ])];
  for (const channel of [0, 1, 2, 3, 9]) {
    const programs = { 'round-bass': 38, 'rubber-bass': 39, pulse: 80, 'fm-bell': 10, 'fm-reed': 85, glass: 98, 'warm-pad': 89, 'hollow-pad': 95 };
    const program = programs[score.patches?.[channel]] ?? [38, 80, 81, 89][channel] ?? 0;
    const events = [{ tick: 0, priority: 0, data: [192 | channel, program] }];
    for (const n of score.notes.filter(n => n.channel === channel)) {
      events.push({ tick: Math.round(n.beat * 480), priority: 2, data: [144 | channel, n.pitch, n.velocity] });
      events.push({ tick: Math.round((n.beat + n.duration) * 480), priority: 1, data: [128 | channel, n.pitch, 0] });
    }
    tracks.push(track(events));
  }
  const header = chunk('MThd', bytes(0, 1, 0, tracks.length, 1, 224));
  const file = `public/assets/music/${MUSIC_LIBRARY[i].file}.mid`;
  writeFileSync(file, Buffer.concat([header, ...tracks]));
  process.stdout.write(`${file}: ${score.notes.length} notes\n`);
}
