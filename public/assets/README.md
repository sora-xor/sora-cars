# Art and music

- `sora-flag.png`: supplied by the user, copied unchanged from `sora_flag.png`.
- `alpine-dusk.png`: created with the built-in image-generation tool for SORA CARS.
  Prompt: a wide 16-bit pixel-art alpine coastline at violet dusk, lavender sky,
  pale moon, layered indigo ridges, snow, pine forest and lake; no cars, road,
  typography or UI. Original image remains in the Codex generated-images directory.
- Sora font files: SORA font project; license in `OFL.txt`.
- MIDI compositions are original music generated from the scores in
  `src/game/music-score.ts`; they evoke early-1980s Japanese electronic pop without
  reproducing existing songs. Rebuild with `npm run assets:music`.

- `sora-retro-sun.png`: user-supplied `retro_sun720.png`, copied unchanged,
  including the original gray background. Used as a printed club badge.
- `story/garage-dusk.png`, `story/harbor-night.png`, `story/sunrise-crew.png`:
  original cutscene backgrounds created using the built-in image-generation tool.
  Full production prompts are recorded in `story/art-prompts.json`. SORA logos
  and all Japanese dialogue/English subtitles are composed as separate UI layers.
  An attempted background extraction of the supplied sun changed its pixels and
  was discarded; only the unchanged supplied sun is bundled.

- `fonts/noto-sans-jp.ttf`: unmodified variable Noto Sans JP from the
  [official Google Fonts collection](https://github.com/google/fonts/tree/main/ofl/notosansjp),
  retrieved 2026-09-05; SIL OFL license in `fonts/noto-sans-jp-OFL.txt`.
  SHA-256: `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f`.
  Bundled locally so Japanese dialogue does not require a runtime font service.

- `story/angles/*-v2.png` and `story/beats/*-v2.png`: new original cutscene
  compositions created with built-in image generation. Every authored location
  and camera direction has its own full illustration, with extra narrative
  images for pivotal dialogue. Production prompts and original-file provenance
  are recorded in `docs/art-prompts/cutscene-*-v2.json`; direction and playback
  behavior are described in `docs/cutscene-art.md`.
- Sixteen additional original story scores bring the local music library to 25
  songs. Their full MIDI exports are in `music/`; `docs/cutscene-music.md` describes
  compositions, camera arrangements, dramatic cues and listening samples.

- `story/beats/*-v3.png`: six additional built-in image-generation compositions
  for the public confession and its audience, the offered/returned key, and Jun’s
  completed sunrise performance with a broadcast reverse angle. Exact prompts,
  references, immutable source paths and SHA-256 hashes are in
  `docs/art-prompts/cutscene-accountability-v3.json`, `cutscene-key-beats-v3.json`,
  and `cutscene-premiere-v3.json`. The cutscene catalogue now has 54 illustrations.
- Returning cutscene themes now use authored entry sections from the existing
  scores. Jun’s motif develops from the opening through full and answering
  phrases to the lifted premiere. MIDI downloads still contain each full song.
