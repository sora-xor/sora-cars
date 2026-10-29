import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MUSIC_ITEMS, MUSIC_LICENSE, MUSIC_SONGS, musicCoverPath, musicItemMetadata, musicSleeves } from '../src/game/music-catalog';
import { STREET_ROUTE_SONGS } from '../src/game/street/route-songs';
import sleeves from '../docs/art-prompts/soundtrack-covers-v2.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('Every released recording binds real audio, artwork and the exact license', () => {
  assert.equal(MUSIC_SONGS.length, 30);
  assert.equal(MUSIC_ITEMS.length, 60, 'Each song sells as a 表 OMOTE and a 裏 URA NFT');
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

test('表 keeps the original sleeve and SKU; 裏 is a distinct back-jacket NFT with the same recording and license', () => {
  assert.equal(new Set(MUSIC_ITEMS.map(item => item.sku)).size, 60);
  for (const song of MUSIC_SONGS) {
    const [omote, ura] = musicSleeves(song.sku);
    assert.deepEqual([omote?.sleeve, ura?.sleeve], ['omote', 'ura']);
    assert.equal(omote!.sku, `music-${song.file}`, '表 keeps the original per-song SKU');
    assert.equal(ura!.sku, `music-${song.file}-ura`);
    assert.equal(omote!.artwork!.path, musicCoverPath(song.file, 'omote')); assert.match(omote!.artwork!.path, /-v1\.png$/);
    assert.equal(ura!.artwork!.path, musicCoverPath(song.file, 'ura')); assert.match(ura!.artwork!.path, /-v2\.png$/);
    assert.deepEqual(omote!.artwork, omote!.assets!.cover, '表 is the original cover recorded for the song');
    const front = musicItemMetadata(omote!, 'fixture-application', 'Fixture licensor'), back = musicItemMetadata(ura!, 'fixture-application', 'Fixture licensor');
    assert.deepEqual(back.recording, front.recording); assert.deepEqual(back.license, front.license); assert.equal(back.price_xor, '1');
    assert.notEqual(back.artwork.sha256, front.artwork.sha256);
    assert.deepEqual([front.sleeve.name, back.sleeve.name], ['表', '裏']);
    assert.match(front.name, /［表］$/); assert.match(back.name, /［裏］$/);
  }
});

test('Every 裏 back jacket printed the current catalog title and liner notes, in catalog order', () => {
  assert.deepEqual(sleeves.covers.map(cover => cover.file), MUSIC_SONGS.map(song => song.file));
  sleeves.covers.forEach((cover, index) => {
    const song = MUSIC_SONGS[index]!, item = musicSleeves(song.sku)[1]!;
    assert.equal(cover.catalog, `SR-${String(index + 1).padStart(3, '0')}`);
    assert.deepEqual(cover.printed, { ja: song.name.ja, en: song.name.en, collection: song.collection, description: song.description }, `${cover.file}: re-run npx tsx scripts/compose-covers.mjs`);
    assert.equal(cover.output.path, `public/${item.artwork!.path}`); assert.equal(cover.output.sha256, item.artwork!.sha256);
  });
});

test('Music release rejects incomplete, unsafe or unbound asset metadata', () => {
  const song = MUSIC_ITEMS[0]!;
  const metadata = (change: object) => musicItemMetadata({ ...song, ...change }, 'fixture-application', 'Fixture issuer');
  for (const key of ['wav', 'mp3', 'preview']) {
    assert.throws(() => metadata({ assets: { ...song.assets, [key]: undefined } }));
    assert.throws(() => metadata({ assets: { ...song.assets, [key]: { ...song.assets![key as 'wav'], path: 'assets/music/../foreign.wav' } } }));
  }
  assert.throws(() => metadata({ artwork: undefined }));
  assert.throws(() => metadata({ artwork: { ...song.artwork!, path: 'assets/music/../foreign.png' } }));
  assert.throws(() => metadata({ artwork: MUSIC_ITEMS[1]!.artwork }), '表 cannot carry the 裏 sleeve');
  assert.throws(() => metadata({ sku: `${song.sku}-ura` }), 'SKU must match its sleeve');
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

test("Each street race's own song sells after Tokyo's, rendered by the game synthesizer at the race's length", () => {
  const routes = MUSIC_SONGS.slice(-STREET_ROUTE_SONGS.length);
  assert.deepEqual(routes.map(song => song.file), STREET_ROUTE_SONGS.map(song => song.file));
  assert.equal(MUSIC_SONGS[MUSIC_SONGS.length - STREET_ROUTE_SONGS.length - 1]!.file, 'meet-me-at-yasukuni', 'They follow the Tokyo route recording');
  routes.forEach((song, index) => {
    const route = STREET_ROUTE_SONGS[index]!;
    assert.deepEqual(song.name, { ja: route.japanese, en: route.name });
    assert.equal(song.collection, 'Japan Routes'); assert.equal(song.artist, 'SORA Cars');
    assert.deepEqual(song.provenance, { kind: 'game-synthesizer-score' });
    assert.equal(song.bpm, Math.round(route.sections * 32 * 60 / route.seconds));
    // The race's score plus the render's lead-in and release tail.
    assert.ok(Math.abs(song.durationSeconds - (route.seconds + 1.08)) < .01, `${song.file} is the race's full song`);
    assert.ok(song.description.ja && song.description.en, `${song.file} has liner notes`);
  });
});

