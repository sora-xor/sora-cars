# Downloadable original soundtrack

The collection contains 26 recordings by **SORA Cars**: all 25 synthesized game
compositions and the user-approved supplied Tokyo song, “靖國神社で会おう /
Meet Me at Yasukuni.” Each has a complete WAV and MP3, a separate 30-second
preview, artwork and the same pinned unlimited-use license.

`node scripts/export-soundtrack.mjs` builds the composed soundtrack from all 25
entries in `MUSIC_LIBRARY`. The script starts and closes its own local Vite
server, renders the real `GameAudio` synthesizer in Chromium, and writes the
downloadable assets to `public/assets/music/audio/`. It does not alter live game
audio or render driving sound effects.

Prerequisites: installed project dependencies, Playwright Chromium, `ffmpeg`
with `libmp3lame`, and `ffprobe` on `PATH`.

Each synthesized song contains its full written 64-bar arrangement, at its original tempo.
The last eight bars have a smooth album fade, followed by the natural release
tail and silence. No second loop is scheduled. The output is stereo 44.1 kHz:

- `{file}.wav`: lossless PCM, 16-bit with triangular dither.
- `{file}.mp3`: widely compatible 320 kbps MP3, with track/title/album metadata.
- `{file}-preview.mp3`: a 30-second, 192 kbps excerpt beginning at bar nine, with
  short entrance/exit fades. Previews are distinct files so the page does not
  need to load every complete song.

Mastering uses measured EBU R128 integrated loudness and oversampled true peak.
A single constant gain targets −16 LUFS, capped at −1.5 dBTP. It preserves
musical dynamics rather than adding a compressor or limiter. Dense arrangements
that reach the peak ceiling first remain quieter than the target. No sampled
commercial recordings are introduced by the exporter.

`node scripts/export-supplied-soundtrack.mjs` then appends the approved supplied
recording defined in `src/game/music-supplied-recordings.json`. It verifies both
the original `world/audio/yasukuni-1986.m4a` and the existing published route
copy against SHA-256 `85401fb75fd6f1f409119dd0ea47642cb9ea173bbb2f06d7a14506febcaf84a6`.
That input is a **lossy AAC** recording: 48 kHz stereo, 254.952 seconds. Its
44.1 kHz/16-bit PCM WAV is a decoded, resampled distribution copy; it is not an
original lossless master and does not recover information lost in AAC encoding.
The 320 kbps MP3 and 30-second preview are derived from that copy. The preview
starts at 30 seconds. The full recording retains the supplied duration and
ending; no bars, note count, synthesized arrangement or unmeasured BPM is claimed.
The separate exporter uses the same constant-gain loudness/peak limits and checks
that the existing 75 audio files remain byte-identical before and after export.

The public `manifest.json` contains track IDs, titles, durations, format details,
file sizes and SHA-256 hashes, source hashes, exact gain and measured loudness.
It can be joined to the store catalog by the stable `file` slug. The private build
evidence in `output/audio/soundtrack/` includes decoded PCM checks for every WAV,
MP3 and preview: duration, finite samples, nonzero stereo difference, RMS,
nonclipping sample peak, and, for synthesized tracks, a silent ending. The full run also verifies every
WAV hash is unique and there were no browser errors.

For a one-track audition, run `node scripts/export-soundtrack.mjs --track=0` or
use a stable slug, for example `--track=jun-the-first-light`. This updates that
track's files and writes a separate report; it deliberately does not publish
a partial `manifest.json`. Run the complete export again before shipping any
changed song or synthesizer, then append the approved supplied recording again.
Numerical rendering may vary between Chromium
versions/platforms; the manifest records the toolchain and exact shipped bytes.

Run `npx tsx --test tests/soundtrack-audio.test.ts` to check the shipped catalog
against the complete 25-score library plus the supplied recording, all 78 audio
file hashes, both supplied-source copies and the exact separate export source
versions. The original 25 export records remain pinned to the retained September
22 report, so adding the supplied recording cannot silently rewrite those 75
files. It also parses the actual PCM WAV
headers and hashes their audio chunks separately from their differing title
tags, proving all 26 recordings differ. This check needs no browser or encoder.
`node scripts/test-soundtrack-playback.mjs` additionally serves the actual assets,
decodes every MP3 preview in Chromium, measures audible stereo PCM, and checks
the complete MP3 durations through native HTML audio metadata. Its report is
`output/audio/soundtrack/browser-playback.json`.

The audio manifest preserves the original synthesis `generatedAt` and
`sourceHashes`; `catalogUpdatedAt` and `suppliedSourceHashes` identify the later
addition. `output/audio/soundtrack/report.json` is the retained original 25-track
export evidence. The supplied export has its own
`output/audio/soundtrack/supplied-recordings-report.json` and
`output/audio/soundtrack/meet-me-at-yasukuni.json`. Artist labels and NFT metadata
use SORA Cars; the original 25 files retain their earlier embedded tags to
preserve their exact bytes.

Audio assets and artwork describe the collectible. License terms and purchase
authorization are defined by the soundtrack store's license and transaction
flow; ID3 tags or an audio file's availability are not ownership evidence.
