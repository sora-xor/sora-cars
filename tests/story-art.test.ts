import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CHAPTERS, RETRY_SCENE } from '../src/game/story';
import { STORY_ANGLE_ART, STORY_BEAT_ART, STORY_CUT_ART, resolveStoryFrame, type StorySceneId, type StoryShot } from '../src/game/story-scenes';

test('every camera direction and story illustration ships as a distinct landscape PNG', () => {
  const files = [...Object.values(STORY_ANGLE_ART).flatMap(shots => Object.values(shots)), ...Object.values(STORY_BEAT_ART)];
  assert.equal(Object.keys(STORY_ANGLE_ART).length, 8);
  assert.equal(new Set(files).size, files.length);
  const hashes = new Set<string>();
  for (const file of files) {
    const png = readFileSync(new URL(`../public/assets/story/${file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.ok(width >= 1280 && height >= 720, `${file}: production landscape resolution`);
    assert.ok(Math.abs(width / height - 16 / 9) < .03, `${file}: full cinematic composition`);
    hashes.add(createHash('sha256').update(png).digest('hex'));
  }
  assert.equal(hashes.size, files.length, 'camera angles cannot be duplicate copies of a single image');
});

test('all cutscenes resolve to new art, with every location and angle exercised by the dialogue', () => {
  const used = new Set<string>();
  const available = new Set<string>([...Object.values(STORY_ANGLE_ART).flatMap(Object.values), ...Object.values(STORY_BEAT_ART)]);
  for (const lines of [...CHAPTERS.flatMap(ch => [ch.intro, ch.victory]), RETRY_SCENE]) {
    let previous: ReturnType<typeof resolveStoryFrame> | undefined;
    for (const index of lines.keys()) {
      const frame = resolveStoryFrame(lines, index);
      assert.ok(available.has(frame.art));
      used.add(`${frame.scene}/${frame.shot}`);
      if (previous && (previous.scene !== frame.scene || previous.shot !== frame.shot)) {
        assert.notEqual(frame.art, previous.art, 'a camera cut must show another illustration, including dramatic beats');
      }
      previous = frame;
    }
  }
  assert.equal(used.size, 32);
});

test('each authored camera cut uses a fresh, distinct illustration across the campaign', () => {
  const sequences = [
    ...CHAPTERS.flatMap(ch => [
      [`ch${String(ch.id + 1).padStart(2, '0')}-intro`, ch.intro] as const,
      [`ch${String(ch.id + 1).padStart(2, '0')}-victory`, ch.victory] as const,
    ]),
    ['retry', RETRY_SCENE] as const,
  ];
  const seenFiles = new Set<string>(), seenHashes = new Set<string>();
  let cuts = 0;
  for (const [sequence, lines] of sequences) {
    const authoredCuts = lines.filter((line, index) => index === 0 || line.scene !== undefined || line.shot !== undefined || line.art !== undefined).length;
    assert.equal(STORY_CUT_ART[sequence]?.length, authoredCuts, `${sequence}: one image per authored cut`);
    let previous: ReturnType<typeof resolveStoryFrame> | undefined;
    for (const index of lines.keys()) {
      const frame = resolveStoryFrame(lines, index, sequence);
      const isCut = index === 0 || lines[index]!.scene !== undefined || lines[index]!.shot !== undefined || lines[index]!.art !== undefined;
      if (!isCut) {
        assert.equal(frame.art, previous?.art, `${sequence}/${index + 1}: dialogue holds the current image`);
      } else {
        assert.ok(!seenFiles.has(frame.art), `${sequence}/${index + 1}: repeated cut image ${frame.art}`);
        seenFiles.add(frame.art);
        const png = readFileSync(new URL(`../public/assets/story/${frame.art}`, import.meta.url));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', frame.art);
        const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
        assert.ok(width >= 1280 && height >= 720 && Math.abs(width / height - 16 / 9) < .03, frame.art);
        const hash = createHash('sha256').update(png).digest('hex');
        assert.ok(!seenHashes.has(hash), `${sequence}/${index + 1}: duplicated image pixels`);
        seenHashes.add(hash);
        cuts++;
      }
      previous = frame;
    }
  }
  assert.equal(cuts, 228);
});

test('special illustrations hold for dialogue and reset at explicit cuts, including back navigation', () => {
  const lines = CHAPTERS[6]!.victory;
  assert.equal(resolveStoryFrame(lines, 0).beat, 'radio-blackout');
  assert.equal(resolveStoryFrame(lines, 1).beat, 'garage-blackout-detail');
  assert.equal(resolveStoryFrame(lines, 2).beat, 'radio-betrayal');
  assert.equal(resolveStoryFrame(lines, 3).beat, 'radio-betrayal-reverse');
  assert.deepEqual(resolveStoryFrame(lines, 5), resolveStoryFrame(lines, 3));
  assert.equal(resolveStoryFrame(lines, 6).beat, 'radio-betrayal');
  assert.equal(resolveStoryFrame(lines, 7).beat, 'radio-contract');
  assert.equal(resolveStoryFrame(lines, 8).beat, undefined);
  assert.equal(resolveStoryFrame(lines, 3).beat, 'radio-betrayal-reverse');
  const ending = CHAPTERS[11]!.victory;
  assert.equal(resolveStoryFrame(ending, 8).beat, undefined, 'consent precedes the kiss illustration');
  assert.equal(resolveStoryFrame(ending, 9).beat, 'sunrise-kiss');
  assert.equal(resolveStoryFrame(ending, 10).art, STORY_ANGLE_ART.sunrise.wide);
});

test('explicit repeated shot directions return from beat artwork to the normal camera', () => {
  const lines = [{ scene: 'radio' as StorySceneId, shot: 'left' as StoryShot, art: 'radio-phone-threat' as const }, {}, { shot: 'left' as StoryShot }];
  assert.equal(resolveStoryFrame(lines, 1).beat, 'radio-phone-threat');
  assert.equal(resolveStoryFrame(lines, 2).art, STORY_ANGLE_ART.radio.left);
});

test('accountability, returned key and completed song have dedicated action and reverse illustrations', () => {
  const publicScene = CHAPTERS[7]!.victory;
  assert.equal(resolveStoryFrame(publicScene, 0).beat, 'public-confession');
  assert.equal(resolveStoryFrame(publicScene, 1).beat, 'public-confession');
  assert.equal(resolveStoryFrame(publicScene, 2).beat, 'public-confession-reverse');
  assert.equal(resolveStoryFrame(publicScene, 3).beat, 'public-confession-reverse');
  assert.equal(resolveStoryFrame(publicScene, 4).beat, 'shared-prototype');
  const keyScene = CHAPTERS[9]!.intro;
  assert.equal(resolveStoryFrame(keyScene, 1).beat, 'boardroom-key-offer');
  assert.equal(resolveStoryFrame(keyScene, 2).beat, undefined);
  assert.equal(resolveStoryFrame(keyScene, 8).beat, 'boardroom-key-return');
  assert.equal(resolveStoryFrame(keyScene, 9).beat, 'boardroom-key-return');
  assert.equal(resolveStoryFrame(keyScene, 10).beat, undefined);
  const ending = CHAPTERS[11]!.victory;
  assert.equal(resolveStoryFrame(ending, 3).beat, 'radio-jun-premiere');
  assert.equal(resolveStoryFrame(ending, 4).beat, 'radio-jun-premiere-reverse');
  assert.equal(resolveStoryFrame(ending, 5).beat, undefined);
});
