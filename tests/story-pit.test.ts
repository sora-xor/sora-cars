import test from 'node:test';
import assert from 'node:assert/strict';
import { TECH_BRANCHES, TECH_NODES, buildValue, buyPart, fittedParts, newGarage, partState, rivalBuild, storyRivals, STORY_REI, STORY_TORU, techNode, type GarageSave } from '../src/game/garage-tech';
import { CHAPTERS, CREW, chapterPosition, storyObjective } from '../src/game/story';
import { COURSE_TIPS, courseConditions, nextPick, pitBriefing } from '../src/game/story-pit';
import { purchasable } from './helpers/garage-drivers';

/** A garage that bought `owned` in order: the latest option of each fork is fitted. */
const owning = (owned: readonly string[], money = 0): GarageSave => ({
  ...newGarage(), money, owned: [...new Set(owned)],
  setup: Object.fromEntries(owned.flatMap(id => techNode(id)!.fork ? [[techNode(id)!.fork!, id]] : [])),
});

test('the briefing reads each course from the native environment', () => {
  assert.deepEqual(courseConditions(0), { rain: 25, wind: 'light', trees: 5, signs: 4, oil: 3 });
  assert.deepEqual(courseConditions(1), { rain: 50, wind: 'strong', trees: 4, signs: 4, oil: 4 });
  assert.deepEqual(courseConditions(2), { rain: 20, wind: 'gusty', trees: 6, signs: 3, oil: 3 });
  assert.throws(() => courseConditions(3), RangeError);
});

test('every course plan is a complete purchase order through the tree', () => {
  for (const [trackId, tip] of COURSE_TIPS.entries()) {
    tip.plan.forEach((id, index) => assert.ok(purchasable(tip.plan.slice(0, index)).some(node => node.id === id), `track ${trackId}: ${id} can be bought in order`));
    assert.deepEqual(TECH_NODES.filter(node => !node.fork && !tip.plan.includes(node.id)), [], `track ${trackId} buys every non-fork part`);
    for (const fork of new Set(TECH_NODES.map(node => node.fork).filter(Boolean))) {
      assert.equal(tip.plan.filter(id => techNode(id)!.fork === fork).length, 1, `track ${trackId} picks one ${fork} option`);
    }
    // The line names the branch of the first pick, and comes from a crew member other than Aki, whose car the player drives.
    assert.ok(tip.branches.includes(techNode(tip.plan[0]!)!.branch), `track ${trackId} tip matches its first pick`);
    assert.ok(tip.branches.every(branch => TECH_BRANCHES.some(b => b.id === branch)));
    assert.ok(CREW.some(member => member.id === tip.crew) && tip.crew !== 'aki');
  }
});

test('the crew pick walks the course plan, around choices the player made', () => {
  const hakone = COURSE_TIPS[0]!.plan, harbor = COURSE_TIPS[1]!.plan;
  assert.equal(nextPick(newGarage(), 0)!.id, hakone[0]);
  assert.equal(partState(newGarage(), hakone[0]!), 'available', 'a new garage can afford its first pick');
  // An unaffordable pick is still the pick: the briefing shows how much more to save.
  assert.equal(nextPick(owning(hakone.slice(0, 3)), 0)!.id, hakone[3]);
  assert.equal(partState(owning(hakone.slice(0, 3)), hakone[3]!), 'short');
  // Owning the other fork option settles that fork; the plan moves on.
  const highrev = owning(['engine-intake', 'engine-cams', 'engine-highrev', 'chassis-tyres', 'chassis-coilovers', 'turbo-controller', 'turbo-intercooler', 'turbo-big']);
  assert.ok(harbor.includes('engine-torque'));
  for (let save = highrev, pick = nextPick(save, 1); pick; save = owning([...save.owned, pick.id]), pick = nextPick(save, 1)) {
    assert.notEqual(pick.id, 'engine-torque');
  }
  assert.equal(nextPick(owning(harbor), 1), null, 'a finished plan has no pick');
  // Both setup options owned, the drift one fitted: the harbor pick swaps the rally setup back in.
  const both = owning([...harbor.slice(0, harbor.indexOf('chassis-rally')), 'chassis-rally', 'chassis-touge']);
  assert.equal(partState(both, 'chassis-rally'), 'stored');
  assert.equal(nextPick(both, 1)!.id, 'chassis-rally');
  // Buying the pick hands over the next one.
  const bought = buyPart({ ...newGarage(), money: 20000 }, harbor[0]!);
  assert.equal(nextPick(bought, 1)!.id, harbor[1]);
});

test('the pre-race briefing states the goal and how far the rivals have tuned', () => {
  const first = pitBriefing(0, newGarage());
  assert.equal(first.chapter, CHAPTERS[0]);
  assert.deepEqual(first.objective, storyObjective(0));
  assert.deepEqual(first.rivals.map(rival => [rival.name.en, rival.style, rival.value]), [['HARBOR DRIVER', null, 0], ['SORA GUEST', null, 0]]);
  assert.equal(first.pick!.id, COURSE_TIPS[CHAPTERS[0]!.trackId!]!.plan[0]);

  for (const [chapter, story] of CHAPTERS.entries()) {
    // Street-race chapters race equal cars and have no pre-race garage.
    if (story.route) { assert.throws(() => pitBriefing(chapter, newGarage()), RangeError); continue; }
    const brief = pitBriefing(chapter, newGarage()), rivals = storyRivals(story.id, 8, 6);
    assert.deepEqual(brief.rivals.map(rival => rival.value), [rivals[5]!.value, rivals[7]!.value], `chapter ${chapter + 1} shows the builds it races`);
    // Each label names the purchase order that produced the build.
    brief.rivals.forEach((rival, i) => assert.equal(rival.style ? buildValue(rivalBuild(rival.style, [STORY_REI, STORY_TORU][i]![story.id]! * 1000)) : 0, rival.value));
  }
  const showdown = pitBriefing(chapterPosition(10), newGarage());
  assert.deepEqual(showdown.rivals.map(rival => rival.name.en), ['Rei Sorashiro', 'Toru Amamiya']);
  assert.deepEqual(showdown.rivals.map(rival => rival.name.ja), ['空城レイ', '天宮トオル']);
  assert.notDeepEqual(showdown.objective, storyObjective(chapterPosition(9)), 'the showdown adds beating Toru');

  const parts = ['turbo-controller', 'chassis-tyres'], built = owning(parts);
  assert.equal(pitBriefing(chapterPosition(4), built).build, buildValue(parts));
  assert.deepEqual(fittedParts(built), parts);
  // Equal cars: everyone stock, as the race will be.
  const equal = pitBriefing(chapterPosition(10), { ...built, stock: true });
  assert.equal(equal.build, 0);
  assert.ok(equal.rivals.every(rival => rival.value === 0 && rival.style === null));
  assert.throws(() => pitBriefing(CHAPTERS.length, newGarage()), RangeError);
});
