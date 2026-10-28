import { RACE_RULES_HASH } from '../src/game/environment';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { signAppearance, verifyAppearance } from '../src/network/appearance';
import { validateReplay, replayState } from '../src/game/engine';
const key = new Uint8Array(32).fill(41), wrongKey = new Uint8Array(32).fill(43);
const roster = [key, wrongKey].map((key, slot) => ({ slot, account: `presentation-${slot}`, inputKeyHex: Buffer.from(ed25519.getPublicKey(key)).toString('hex') }));
const appearance = { skin: 'aki-first-light', upgrade: 'club-aero-86' };
test('cosmetic announcements bind exact designs, session scope and input key without authorizing any NFT transfer', () => {
  const packet = signAppearance('scope', 0, appearance, key);
  assert.deepEqual(verifyAppearance(packet, 'scope', roster).appearance, appearance);
  for (const bad of [{ ...packet, scope: 'another' }, { ...packet, slot: 1 }, { ...packet, appearance: { ...appearance, skin: 'mei-sakura-film' } }, { ...packet, appearance: { ...appearance, speed: 100 } }, { ...packet, nftOwnership: true }, signAppearance('scope', 0, appearance, wrongKey)]) assert.throws(() => verifyAppearance(bad, 'scope', roster));
});
test('cosmetic replay metadata preserves simulation and rejects executable or unknown designs', () => {
  const original = { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0, names: ['A', 'B'], skins: [0, 1], inputs: Array.from({ length: 12 }, () => [1, 1]), savedAt: new Date(0).toISOString(), source: 'practice' };
  const plain = validateReplay(original), decorated = validateReplay({ ...original, appearances: [appearance, { skin: null, upgrade: null }] });
  assert.deepEqual(replayState(decorated), replayState(plain));
  assert.deepEqual(decorated.appearances?.[0], appearance);
  assert.throws(() => validateReplay({ ...original, appearances: [appearance] }));
  assert.throws(() => validateReplay({ ...original, appearances: [{ skin: 'https://remote.invalid/image.svg', upgrade: null }, appearance] }));
});
