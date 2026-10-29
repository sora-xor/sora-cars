import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSync } from 'node:fs';
import { CHAPTERS, CREW, STORY_CAST, RETRY_SCENE, completeStoryChapter, storyProgress, storyGrid, storyObjectiveMet } from '../src/game/story';
import { STORY_SCENES, resolveStoryShot, resolveStorySetting } from '../src/game/story-scenes';

test('the complete three-act campaign has local art, bilingual dialogue and consistent characters', () => {
  assert.equal(CREW.length, 6);
  assert.equal(STORY_CAST.length, 9);
  assert.equal(new Set(STORY_CAST.map(c => c.id)).size, 9);
  assert.deepEqual(CHAPTERS.map(c => c.id), Array.from({ length: 12 }, (_, i) => i));
  assert.deepEqual(CHAPTERS.map(c => c.act), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  const scenes = new Set();
  for (const scene of Object.values(STORY_SCENES)) accessSync(new URL(`../public/assets/story/${scene.art}`, import.meta.url));
  for (const chapter of CHAPTERS) {
    assert.ok([0, 1, 2].includes(chapter.trackId));
    accessSync(new URL(`../public/assets/story/${chapter.art}`, import.meta.url));
    assert.ok(chapter.intro.length >= 8 && chapter.victory.length >= 5);
    assert.ok(chapter.synopsis.ja && chapter.synopsis.en && chapter.dossier.ja && chapter.dossier.en);
    for (const lines of [chapter.intro, chapter.victory, RETRY_SCENE]) for (const [index, line] of lines.entries()) {
      assert.ok(STORY_CAST.some(c => c.id === line.speaker), line.speaker);
      assert.match(line.ja, /[\u3040-\u30ff\u4e00-\u9fff]/);
      assert.ok(line.en.length > 10);
      const frame = resolveStoryShot(lines, index);
      assert.ok(STORY_SCENES[frame.scene]); scenes.add(frame.scene);
      assert.ok(['wide', 'left', 'right', 'detail'].includes(frame.shot));
    }
  }
  assert.equal(scenes.size, 8);
});

test('dialogue can be revisited with the correct inherited shot and scene', () => {
  const lines = CHAPTERS[0]!.intro;
  assert.deepEqual(resolveStoryShot(lines, 2), { scene: 'garage', shot: 'left' });
  assert.deepEqual(resolveStoryShot(lines, 3), { scene: 'ledger', shot: 'wide' });
  assert.deepEqual(resolveStoryShot(lines, 6), { scene: 'ledger', shot: 'detail' });
  assert.deepEqual(resolveStoryShot(lines, 0), { scene: 'garage', shot: 'wide' });
});

test('a time/place caption holds through its shot and the next camera cut restores the scene caption', () => {
  const lines = CHAPTERS[10]!.intro, broadcast = { ja: '横浜・港の出走前放送', en: 'YOKOHAMA · PRE-RACE BROADCAST' };
  assert.deepEqual(resolveStorySetting(lines, 11), broadcast);
  assert.deepEqual(resolveStorySetting(lines, 12), broadcast, 'Aki answers in the same shot, so the caption holds');
  assert.deepEqual(resolveStorySetting(lines, 13), { ja: STORY_SCENES.harbor.place, en: STORY_SCENES.harbor.english });
  assert.deepEqual(resolveStorySetting(lines, 0), { ja: STORY_SCENES.harbor.place, en: STORY_SCENES.harbor.english });
});

test('story progression cannot skip chapters and the showdown requires beating its actual rival', () => {
  assert.equal(completeStoryChapter(0, 0, 3), 1);
  assert.equal(completeStoryChapter(0, 0, 4), 0);
  assert.equal(completeStoryChapter(0, 2, 1), 0);
  assert.equal(completeStoryChapter(1, 1, 1), 2);
  assert.equal(completeStoryChapter(2, 2, 2), 3);
  assert.equal(completeStoryChapter(3, 0, 1), 3);
  assert.equal(completeStoryChapter(10, 10, 3, 1), 10, 'podium behind Toru is not a showdown win');
  assert.equal(completeStoryChapter(10, 10, 2, 2), 10, 'an exact tie does not beat Toru');
  assert.equal(completeStoryChapter(10, 10, 1), 10, 'missing rival outcome cannot satisfy the objective');
  assert.equal(completeStoryChapter(10, 10, 3, 4), 11);
  assert.equal(completeStoryChapter(11, 11, 2), 12);
  assert.equal(storyObjectiveMet(10, 3, 9), false);
  assert.equal(storyProgress({ unlocked: 99 }), 0);
  assert.equal(storyProgress(-1), 0);
  assert.equal(storyProgress(99), 12);
});

test('the story grid includes the driver challenged in the dialogue and preserves replay player identification', () => {
  for (const chapter of CHAPTERS) {
    const grid = storyGrid(chapter.id);
    assert.equal(grid.length, 8);
    assert.equal(new Set(grid).size, 8);
    assert.equal(grid.indexOf('YOU'), 6);
    assert.equal(grid.filter(n => n.includes('空本')).length, 0, 'the player is Aki, without a duplicate Aki opponent');
    if (chapter.id >= 3) assert.match(grid[7]!, /天宮/);
  }
});
