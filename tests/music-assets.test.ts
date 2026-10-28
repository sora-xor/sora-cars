import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MUSIC_ITEMS, MUSIC_LICENSE, musicItemMetadata } from '../src/game/music-catalog';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('Every released recording binds real audio, artwork and the exact license', () => {
  assert.equal(MUSIC_ITEMS.length, 26);
  assert.ok(MUSIC_ITEMS.some(item => item.file === 'meet-me-at-yasukuni'), 'Approved supplied Tokyo recording is included');
  const coverHashes = new Set<string>();
  for (const item of MUSIC_ITEMS) {
    const metadata = musicItemMetadata(item, 'fixture-application', 'Fixture licensor');
    assert.equal(metadata.price_xor, '1');
    assert.equal(metadata.artist, 'SORA Cars');
    assert.equal(metadata.license.sha256, hash(readFileSync(`public/${MUSIC_LICENSE.path}`)));
    for (const file of [metadata.recording.wav, metadata.recording.mp3, metadata.recording.preview, metadata.artwork]) {
      const bytes = readFileSync(`public/${file.path}`);
      assert.equal(bytes.length, file.bytes, file.path);
      assert.equal(hash(bytes), file.sha256, file.path);
    }
    const cover = readFileSync(`public/${metadata.artwork.path}`);
    assert.equal(cover.subarray(1, 4).toString(), 'PNG');
    assert.ok(cover.readUInt32BE(16) >= 1024 && cover.readUInt32BE(20) >= 1024);
    coverHashes.add(metadata.artwork.sha256);
  }
  assert.equal(coverHashes.size, MUSIC_ITEMS.length);
});

test('Music release rejects incomplete, unsafe or unbound asset metadata', () => {
  const song = MUSIC_ITEMS[0]!;
  const metadata = (change: object) => musicItemMetadata({ ...song, ...change }, 'fixture-application', 'Fixture issuer');
  for (const key of ['wav', 'mp3', 'preview', 'cover']) {
    assert.throws(() => metadata({ assets: { ...song.assets, [key]: undefined } }));
    assert.throws(() => metadata({ assets: { ...song.assets, [key]: { ...song.assets![key as 'wav'], path: 'assets/music/../foreign.wav' } } }));
  }
  assert.throws(() => metadata({ durationSeconds: NaN }));
  assert.throws(() => metadata({ license: { ...MUSIC_LICENSE, sha256: '0'.repeat(64) } }));
  assert.throws(() => musicItemMetadata(song, 'fixture', ''));
  assert.throws(() => musicItemMetadata(song, 'fixture', 'Issuer\nInjected text'));
});

test('Tokyo metadata binds supplied AAC provenance and the same artist, price and license', () => {
  const song = MUSIC_ITEMS.find(item => item.file === 'meet-me-at-yasukuni')!;
  const metadata = musicItemMetadata(song, 'fixture-application', 'Fixture issuer');
  assert.equal(song.collection, 'Tokyo Routes'); assert.equal(song.bpm, null);
  assert.equal(metadata.artist, 'SORA Cars'); assert.equal(metadata.price_xor, '1');
  assert.equal(metadata.license.sha256, MUSIC_LICENSE.sha256);
  assert.deepEqual(metadata.recording.provenance, song.assets!.provenance);
  assert.equal(metadata.recording.provenance.kind, 'supplied-lossy-recording');
  if (metadata.recording.provenance.kind !== 'supplied-lossy-recording') throw new Error('Expected supplied recording provenance');
  assert.equal(metadata.recording.provenance.source.lossy, true);
  assert.equal(metadata.recording.provenance.source.codec, 'aac');
  assert.throws(() => musicItemMetadata({ ...song, assets: { ...song.assets!, provenance: undefined } }, 'fixture', 'Fixture issuer'));
  assert.throws(() => musicItemMetadata({ ...song, artist: 'Unapproved artist' }, 'fixture', 'Fixture issuer'));
});
