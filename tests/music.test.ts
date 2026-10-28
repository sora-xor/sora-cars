import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeScore, MUSIC_LIBRARY } from '../src/game/music-score';

test('all 25 original compositions export complete, playable Standard MIDI type 1 files', () => {
  const files = MUSIC_LIBRARY.map(song => song.file);
  const distinct = new Set<string>();
  files.forEach((file, index) => {
    const bytes = readFileSync(`public/assets/music/${file}.mid`), score = makeScore(index);
    assert.equal(bytes.subarray(0, 4).toString(), 'MThd');
    assert.equal(bytes.readUInt32BE(4), 6); assert.equal(bytes.readUInt16BE(8), 1);
    assert.equal(bytes.readUInt16BE(10), 6); assert.equal(bytes.readUInt16BE(12), 480);
    let cursor = 14, onCount = 0, tempo = 0;
    const channels = new Set<number>();
    for (let track = 0; track < 6; track++) {
      assert.equal(bytes.subarray(cursor, cursor + 4).toString(), 'MTrk');
      const end = cursor + 8 + bytes.readUInt32BE(cursor + 4); cursor += 8;
      let tick = 0, ended = false;
      const held = new Set<number>();
      const vlq = () => { let value = 0, count = 0, b: number; do { b = bytes[cursor++]!; value = (value << 7) | (b & 127); assert.ok(++count <= 4 && cursor <= end); } while (b & 128); return value; };
      while (cursor < end) {
        tick += vlq(); const status = bytes[cursor++]!;
        if (status === 255) {
          const type = bytes[cursor++]!, length = vlq();
          if (type === 81) { assert.equal(length, 3); tempo = bytes.readUIntBE(cursor, 3); }
          if (type === 47) { assert.equal(length, 0); ended = true; }
          cursor += length;
        } else if ((status & 240) === 192) { assert.ok(bytes[cursor++]! < 128); }
        else {
          assert.ok((status & 240) === 144 || (status & 240) === 128);
          const pitch = bytes[cursor++]!, velocity = bytes[cursor++]!;
          assert.ok(pitch < 128 && velocity < 128);
          if ((status & 240) === 144) { assert.ok(!held.has(pitch), 'no ambiguous overlapping MIDI note'); held.add(pitch); onCount++; channels.add(status & 15); }
          else { assert.ok(held.delete(pitch), 'every note-off has a matching note-on'); }
        }
        assert.ok(cursor <= end && tick <= score.beats * 480);
      }
      assert.ok(ended && held.size === 0, 'every track ends with all notes released');
    }
    assert.equal(cursor, bytes.length); assert.equal(onCount, score.notes.length);
    assert.equal(tempo, Math.round(60_000_000 / score.bpm));
    assert.deepEqual([...channels].sort((a, b) => a - b), [0, 1, 2, 3, 9]);
    distinct.add(bytes.toString('hex'));
  });
  assert.equal(distinct.size, MUSIC_LIBRARY.length);
});
