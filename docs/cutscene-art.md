# SORA CARS — cutscene artwork

The campaign now assigns one distinct illustration to every authored camera cut. The sequence-specific mapping lives in `src/game/story-cut-art.json`: each `scene`, `shot`, or `art` direction after a sequence opens advances to a new entry. Dialogue without a direction holds the current frame. The eight-location angle library and location posters remain available for menus, references, and scripts outside the campaign.

Every artwork must include the user's supplied SORA emblem, retained at
`public/assets/branding/sora-emblem-source.png` (SHA-256
`4c9202c9a44065856dc6d954e8afd6a99787b3a45c1ebad8c31a655e75260a69`).
Use that image as an explicit generation/edit reference. The red circular mark has
straight white horizontal bars, their central connection and diagonal white
openings through the lower circumference. A font character or the word “SORA”
alone is not a replacement. Integrate it visibly on existing signs, garments or
props, preserve scene continuity, and inspect each delivered image. The 25 music
covers and the original 62-image story catalog passed the September 26 emblem
audit (`artifacts/story-emblem-audit-2026-09-26.json`). Twenty-five story images
were corrected, with versioned replacements and originals retained. This audit
does not cover the additional per-cut illustrations currently being produced;
each new image must pass the same visual check before the expanded campaign is
declared complete.

Run `node --import tsx scripts/check-story-emblem-coverage.mjs` after changing
art references. It resolves the actual per-cut campaign, includes menu and
fallback images, and checks each file against the exact bytes in a passed
individual visual-review audit. Its report is
`artifacts/story-emblem-coverage-current.json`. A new or changed image remains
unreviewed until inspected; this check does not attempt automatic logo
recognition. Concurrent script changes invalidate the run.

The 32 base angle PNGs live in `public/assets/story/angles/`. Twenty-two special beat PNGs in `public/assets/story/beats/` illustrate story actions and reactions. Additional frames in `public/assets/story/scenes/` fill repeated angles and sequence-specific cuts. Returning to a line restores the frame assigned to that cut.

All images were created with built-in image generation and saved into this project. Exact production prompts, reference paths, and original generated-file provenance are retained in `docs/art-prompts/cutscene-angles-a-v2.json`, `cutscene-angles-b-v2.json`, `cutscene-beats-v2.json`, `cutscene-beats-finish-v2.json`, and `cutscene-beat-reverses-v2.json`. The September 22 continuation adds `cutscene-key-beats-v3.json`, `cutscene-accountability-v3.json`, and `cutscene-premiere-v3.json`, each with exact prompts, reference paths, source files and hashes. The original composition inventory is `cutscene-angle-inventory.json`.

The cinema loads the opening shot and looks four lines ahead. Each camera cut switches directly to its assigned frame; while a new image loads, the canvas is dark so the preceding shot does not appear beneath new dialogue. Drift is subtle because camera framing is drawn into each image. Narrow screens contain the full image to preserve dialogue faces and story props. Motion pause and reduced motion keep the image still while permitting manual camera cuts.

Validation is provided by `tests/story-art.test.ts`, `scripts/test-cutscene-art.mjs`, and the full `scripts/test-story.mjs` player traversal. The latter also checks the adaptive score, keyboard/gamepad/touch controls, dialogue log, actual local race transitions and bilingual layout. The artwork fixture covers all 301 authored/retry lines at desktop, 390 px and 320 px widths and saves actual rendered views and contact sheets. These fixtures do not claim a human-earned campaign completion.

## September 26: fresh artwork at every camera cut

All 228 authored cuts across the 25 introduction, aftermath, and retry sequences now have distinct image files and SHA-256 hashes. The sequence manifest prevents a familiar location or repeated `left`/`right` direction from selecting an earlier frame. A missing manifest entry fails explicitly instead of silently recycling a location image. Dialogue holds and Back navigation remain deterministic.

The expanded pass added 159 missing cut compositions after the opening-frame pass. Available original prompts and generated-file histories are retained in `docs/art-prompts/cutscene-fresh-*.json`; repairs have separate records. `artifacts/cutscene-fresh-assets.json` records the complete final mapping, dimensions, hashes, and recovered matching generated sources. Original prompt records are incomplete for a few interrupted generation calls; the asset inventory records the actual shipped bytes.

The player rendered all 301 lines and all 228 distinct illustrations at 1440, 390, and 320 px widths, with no browser errors. Rendered pixels change at cuts; pause and Back pass. All 29 contact sheets and sampled desktop/mobile layouts were visually reviewed. Character corrections include Jun/Daichi in chapter 12, Ren in chapter 10, and Aki in a boardroom reverse. The last Aki correction received a focused desktop/mobile recheck and refreshed screenshots. See `artifacts/cutscene-art-fresh.json` and `output/browser/cutscene-art-fresh/`. Ten focused story/art tests and the production build pass. An independent delayed-load check confirms that a pending image clears the old frame and Back restores the earlier image.

## September 12 verification

- All 48 distinct PNGs passed resolution, uniqueness, camera coverage and story-beat restoration checks.
- The real player rendered all 301 dialogue lines in 25 sequences, including all 48 scripted illustrations, at 1440 px, 390 px and 320 px viewport widths. See `artifacts/cutscene-art-v2.json` and the six contact sheets in `output/browser/cutscene-art-v2/`.
- The full application story traversal passed all 12 introductions, 12 aftermaths, a real local AI race outcome and retry, bilingual pivotal scenes, music cue changes, Back, log, pause, reduced motion, keyboard, touch and gamepad. See `artifacts/story-browser.json`.
- All 13 focused story/art/music tests passed, as did actual PCM checks for 16 new themes and the existing driving/external music regressions. Production build passed.

The small-screen toolbar now includes a visible Music toggle and preserves clear location labels in portrait and short landscape layouts.


## September 22 story moments

The September 22 pass brought the catalogue at that time to 54 compositions. Chapter numbers here are player-facing (one-based).

| Chapter / scene | Dialogue lines | Artwork |
| --- | --- | --- |
| 8 / aftermath | 1–2 | Ren admits his relay disclosure at a public microphone, with his agreement and account visible. |
| 8 / aftermath | 3–4 | Reverse angle shows the questioning shopkeepers and couriers, plus borrowed equipment being organized. |
| 10 / introduction | 2 | Celeste offers the workshop key on its envelope while Aki’s hand stays withdrawn. |
| 10 / introduction | 9–10 | Aki pushes the key back; the key, envelope and active hand stay above the subtitle region. |
| 12 / aftermath | 4 | Jun performs his finished song with Ren at the mixing desk. A bilingual caption identifies the previous morning's recording, now heard at Nikko. |
| 12 / aftermath | 5 | A close broadcast angle keeps Jun behind Ren, retaining the recorded-morning caption and dawn lighting before the next line returns to present-day Nikko. |

The public-confession illustrations keep the harbor artwork’s bib-up overalls for Aki; the radio scenes use her established tied-down bib. Dialogue text, plot choices and race requirements are unchanged. Held lines retain the new composition, explicit cuts clear it, and Back resolves it again.

Run `npm run test:cutscene-art` against a local Vite server. The September 22 screenshots and seven contact sheets are retained under `output/browser/cutscene-art-v3/`; their historical coverage report is `artifacts/cutscene-art-v3.json`. New runs use the `cutscene-art-fresh` paths described above.


The September 22 expanded-art pass rendered all 301 lines and all 54 illustrations across 25 sequences, at 1440, 390 and 320 px widths, and checked pause/cut/Back behavior. All six additions were reviewed in their actual desktop and narrow dialogue layouts. Fifteen focused story/art/music tests passed. `artifacts/cutscene-continuation-assets.json` verifies unique files and byte-exact generated-source provenance for the six additions.

Music verification renders the actual Web Audio score and checks developed entrances against the expected post-entrance note schedule, including wraparound and camera changes. `output/audio/cutscene-score/jun-premiere-developed.wav` previews the newly selected premiere phrase; `report.json` records the checks.

The September 22 full application traversal passed all 12 introductions and 12 aftermaths with 305 music observations, a real local AI race outcome/retry, ten pivotal screenshot sets and six recording/present-day caption-history checks, keyboard/touch/gamepad, Back/log/pause/reduced motion, and zero browser errors. Source hashes stayed unchanged through the run; `artifacts/story-browser.json` records the current result. The test uses native Metal on macOS for the production 3D renderer and an explicit favicon in its isolated cinema fixture. Production build passed with the existing bundle-size advisory.

## October 29: chapter 3 office frames

Chapter 3's introduction used the boardroom angles (`angles/boardroom-{wide,detail,left,right}-v3.png`) for cuts 5–8. Those frames show Aki at a table with Celeste and Toru while Rei explains CROWN in her office, a chapter before Aki meets either of them. Four new frames keep the explanation in Rei's credit office: `scenes/ch03-intro-cut05-office-v1.png` to `cut08-office-v1.png` (Rei's crown-and-string chart, the rise-and-plunge lending graph, Yui at the stamped harbor plots, and the CROWN terminal brochure). The four lines now use the `office` scene, so their caption reads 融資相談室 / CREDIT OFFICE.

Codex (`gpt-6-astra`, ultra reasoning) drew them with its built-in image generation from the chapter's office angles, character references and the supplied emblem. Prompts, ordered inputs, generated sources and hashes are in `docs/art-prompts/cutscene-ch03-office-v1.json`. The boardroom files are unchanged on disk and remain the boardroom fallback angles. Each new frame carries the exact emblem centred on a folder; `artifacts/story-office-emblem-audit-2026-10-29.json` records the review, and `scripts/check-story-emblem-coverage.mjs` passes 240/240.

## October 29: the street-race chapters

Five chapters (ids 12–16, woven in before the finale) added 47 authored cuts. Every cut has its own new 1672×941 frame, so the campaign now has 275 distinct cut illustrations across 35 sequences.

- **New locations:** `iroha` (Nikko · Irohazaka), `kudan` (Tokyo · Kudan), `aizu` (Aizu-Wakamatsu · Nanokamachi), `gion` (Kyoto · Gion) and `nara` (Nara · Sarusawa Pond). Each has four angle frames (`angles/<scene>-<shot>-v1.png`), each used once as a cut.
- **The other 27 cuts** are `scenes/ch13`–`ch17-*-v1.png`.
- **Places shown:**
  - Umagaeshi and the Akechidaira overlook above Lake Chūzenji;
  - Yasukuni's steel Shinmei great torii at Kudanshita before dawn, and the palace moat at Marunouchi at sunrise;
  - Nanokamachi's kura and lacquer workshop, and the Iimoriyama lookout toward Tsuruga-jō;
  - Gion's lattices, the brick Keage power station and Shijō Ōhashi;
  - Sarusawa Pond under Kōfuku-ji's pagoda, the Great Buddha Hall and the Wakakusa-yama summit.
- **Generation:** Codex (`gpt-6-astra`, `image_gen`) drew each frame from the crew's existing angle art as character references, with the exact emblem as the last reference. A second built-in generated edit then redrew every SORA badge as the reference emblem, because the first pass had drawn several as the kanji 夫 or 未. The same edit turned one background torii (`ch14-intro-cut05`) from a vermilion Myōjin form into Yasukuni's plain steel Shinmei form.
- **Nara summit view:** `ch17-victory-cut03` and `cut04` first showed a lit bay and a harbour skyline below the hill, carried over from their harbour character reference. A further generated edit replaced that view with the Nara basin seen from Wakakusa-yama, matched to `ch17-victory-cut01`: Nara Park's woods, the Daibutsuden roof, Kōfuku-ji's pagoda, low roofs and the Ikoma range. The prompt record keeps both edit stages. All three summit frames place the pagoda right of the Daibutsuden; seen from the summit it stands to the left.
- **Records:** prompts, references, first-pass and edited sources, and hashes are in `docs/art-prompts/cutscene-street-chapters-v1.json`. The visual emblem review is `artifacts/story-street-chapters-emblem-audit-2026-10-29.json`, and `scripts/check-story-emblem-coverage.mjs` passes for all 287 current story images.
- **Seasons:** the street routes' races are dressed for autumn, and Tokyo for spring, and the cutscene art follows the race each chapter leads into. The dialogue stays season-neutral, so the screenplay keeps its August–September 1986 timeline.
