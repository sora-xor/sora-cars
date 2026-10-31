import test from 'node:test';
import assert from 'node:assert/strict';
import { TECH_NODES, tuneFor } from '../src/game/garage-tech';
import { CAR_STATS, RACE_GAINS, READING_FIELDS, chipLevel, effectLines, partChips } from '../src/game/part-effects';
import { STOCK_TUNE, type CarTune } from '../src/game/tuned-engine';

const chips = (id: string) => partChips(id).map(chip => `${chip.id}${chip.level > 0 ? '+' : chip.level < 0 ? '-' : ''}${chip.level ? Math.abs(chip.level) : ''}`);

test('every part card names what it improves, what it adds and what it costs', () => {
  for (const node of TECH_NODES) {
    const summary = partChips(node.id);
    assert.ok(summary.some(chip => chip.level > 0 || chip.level === 0), `${node.id} shows at least one benefit`);
    assert.ok(summary.every(chip => Number.isInteger(chip.level) && Math.abs(chip.level) <= 3));
    // Improvements first, then special mechanics, then trade-offs.
    const order = summary.map(chip => chip.level > 0 ? 0 : chip.level === 0 ? 1 : 2);
    assert.deepEqual(order, [...order].sort(), `${node.id} chip order`);
  }
  assert.deepEqual(chips('engine-intake'), ['speed+1', 'accel+1']);
  assert.deepEqual(chips('engine-highrev'), ['speed+3', 'accel-1'], 'the fork names its slower recovery');
  assert.deepEqual(chips('body-light'), ['speed+1', 'accel+1', 'tough-2'], 'lightweight shows the toughness it gives up');
  assert.deepEqual(chips('chassis-touge'), ['grip+1', 'drift']);
  assert.deepEqual(chips('body-windtunnel'), ['speed+1', 'draft']);
  assert.deepEqual(chips('turbo-antilag'), ['boost+3', 'antilag']);
  assert.equal(chipLevel(0.03), 0, 'tiny side effects stay off the card');
  assert.equal(chipLevel(-0.31), -3);
});

test('the detail panel reads every effect as the driving model races it, gains before trade-offs', () => {
  for (const node of TECH_NODES) for (const field of Object.keys(node.effects)) assert.ok(READING_FIELDS.includes(field as keyof CarTune), `${node.id} ${field} has a reading`);
  const line = (lines: ReturnType<typeof effectLines>, field: keyof CarTune) => lines.find(entry => entry.field === field)!;
  const intake = effectLines(STOCK_TUNE, tuneFor(['engine-intake']));
  assert.deepEqual(intake.map(entry => [entry.field, entry.before, entry.after, entry.better]), [['topSpeed', '259 km/h', '262 km/h', true], ['accel', '100%', '102%', true]]);
  assert.deepEqual([line(effectLines(STOCK_TUNE, tuneFor(['turbo-controller'])), 'boostCost').before, line(effectLines(STOCK_TUNE, tuneFor(['turbo-controller'])), 'boostCost').after], ['1.3 s', '1.6 s']);
  const cage = line(effectLines(STOCK_TUNE, tuneFor(['body-cage'])), 'treeLoss');
  assert.deepEqual([cage.label.en, cage.before, cage.after, cage.better], ['Damage per hit', '100%', '73%', true]);
  // The three impact losses become one toughness, so the cage lists it once, beside its launch traction.
  assert.deepEqual(effectLines(STOCK_TUNE, tuneFor(['body-cage'])).map(entry => entry.label.en), ['Low-speed pull', 'Damage per hit']);
  const rally = effectLines(tuneFor(['chassis-tyres', 'chassis-coilovers']), tuneFor(['chassis-tyres', 'chassis-coilovers', 'chassis-rally']));
  assert.deepEqual(rally.map(entry => entry.label.en), ['Low-speed pull', 'Tyre grip', 'Crosswind push', 'Rain grip', 'Rail scrape']);
  const touge = line(effectLines(STOCK_TUNE, tuneFor(['chassis-touge'])), 'driftCharge');
  assert.deepEqual([touge.before, touge.after], ['—', '+18%']);
  // Swapping a fork option shows what the old option took with it, marked as costs, last.
  const before = tuneFor(['body-cage', 'body-bumpers', 'body-armor']), after = tuneFor(['body-cage', 'body-bumpers', 'body-light']);
  const swap = effectLines(before, after);
  assert.ok(swap.some(entry => entry.field === 'accel' && entry.better) && swap.some(entry => entry.field === 'treeLoss' && !entry.better));
  assert.deepEqual(swap.map(entry => entry.better), [...swap.map(entry => entry.better)].sort((a, b) => Number(b) - Number(a)));
  assert.deepEqual(effectLines(before, before), []);
});

test('car stats are zero at stock and every part moves at least one of them or adds a mechanic', () => {
  for (const stat of CAR_STATS) assert.equal(stat.value(STOCK_TUNE), 0, stat.id);
  for (const node of TECH_NODES) {
    const tune = tuneFor([node.id]);
    assert.ok(CAR_STATS.some(stat => stat.value(tune) !== 0) || ['driftCharge', 'draft', 'boostKick'].some(field => field in node.effects), node.id);
  }
});

test('every part has a measured race gain for each course', () => {
  assert.deepEqual(Object.keys(RACE_GAINS).sort(), TECH_NODES.map(node => node.id).sort());
  for (const [id, gains] of Object.entries(RACE_GAINS)) {
    assert.equal(gains.length, 3, id);
    assert.ok(gains.every(seconds => Number.isFinite(seconds) && seconds >= 0 && seconds < 5), `${id} ${gains}`);
  }
});
