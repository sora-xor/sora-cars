# SORA CARS — music direction and cue sheet

The local soundtrack contains 25 original compositions. The first nine remain available, including the three race songs. Sixteen new story themes each have their own written melody, answer phrase, chord route, bass line and rhythm. They use early-1980s Japanese electronic vocabulary: clocked sequencers, syncopated synthetic bass, FM bells and reeds, drum-machine percussion, and warm sustained chords. No commercial recording, sampled melody or remote music service is used.

Every song is a 64-bar composition with an opening statement, contrasting answer, spare middle section and developed return. The MIDI downloads contain the same notes as the in-game synthesis. Standard MIDI instruments approximate the local analog/FM patches; a MIDI player's sound bank determines its exact timbre.

## New themes

| Song | Musical character | Dramatic role |
| --- | --- | --- |
| Blank Side Promise | 104 BPM; bright seventh chords, a falling answer, softly swung bell melody | The cassette, tentative affection and a promise to listen |
| Three Weeks of Paper | 92 BPM; half-step harmony, spare bass, muted FM reed | The workshop deadline and concealed anxiety |
| Milk Crates at Midnight | 116 BPM; offbeat minor groove, springy bass and a rising phrase | Daichi, his brother and the working harbor |
| Carbon Copy Testimony | 108 BPM; suspended voicing and a questioning uneven phrase | Documents, admissions, public accountability |
| Crown on the Grid | 120 BPM; semitone/tritone changes, rigid pulse and chromatic melody | CROWN and the Meridian Council's control |
| Open Circuit Breakfast | 124 BPM; major/add-nine chords and a skipping bell answer | Prototypes becoming useful to real people |
| One Umbrella, Two Chairs | 82 BPM; spacious major-nine color and long bell phrases | Rain, vulnerability and the first date |
| Glass Permission | 98 BPM; augmented harmony, glass/FM colors and a restrained pulse | Tempting offers, exclusive rights and sponsor threats |
| Two A.M. Relay | 132 BPM; urgent bass, sixteenth-note hats and compact answering phrases | The precarious broadcast and replacement relays |
| Dead Air Confession | 68 BPM; descending fragments, unresolved semitones and sparse percussion | The blackout, betrayal and Aki's hurt |
| Borrowed Power Waltz | 94 BPM; a three-eighth-note cross-rhythm inside 4/4 and warm seventh chords | Her father's notebook, asking for help, reopening |
| The Frequency Home | 110 BPM; relaxed minor groove and a rising second phrase | Shared duties, honest repairs and getting home |
| No Master Key | 122 BPM; assertive minor/add-nine harmony and an upward final answer | Returning the key and refusing unilateral control |
| Outrun the Dawn | 148 BPM; driving octave bass and a high, fast lead | The final challenge and its earned resolution |
| Jun: The First Light | 114 BPM; open chords, syncopated FM melody and a lifted final chorus | Jun's finished song, first played on borrowed power and premiered at sunrise |
| Side B: Press Record | 88 BPM; unhurried major-seventh resolution and an answering bell phrase | Mutual confession, the private first kiss and breakfast |

## Scoring behavior

`src/game/music-cues.ts` contains explicit dialogue positions for all 12 introductions and 12 victory scenes, plus the retry scene. A cue's name describes the actual dramatic event. Music is not selected by chapter modulo, random index, or speaker identity.

Camera direction changes the arrangement while the song keeps its place:

- Wide shots open the stereo field and bring in the ensemble and rhythm.
- Left close-ups foreground the lead melody and reduce drums and arpeggios.
- Right reverse angles answer with arpeggios and a firmer bass pulse.
- Details foreground glass/bell ostinatos and pads, with restrained bass and percussion.

Scene and dramatic mood also shape brightness and instrument levels. A new camera arrangement settles over a short, smooth parameter ramp. A new composition crossfades over about 0.8 seconds. Held dialogue, text reveal, the dialogue log, and motion pause leave the musical transport running; Back restores the cue appropriate to that earlier line. The cue sheet can change a scene's mood without restarting its theme, such as the admission and rejection within the blackout.

Returning themes have authored entrances into their later phrases. Ordinary dialogue pacing often changes the song before an entire opening finishes; starting every reprise at beat zero would hide most of the written music. `entryBeat` is measured in quarter notes and defaults to zero. Beat 32 enters the full statement, beats 64 and 96 its answering phrases, beat 128 the spare middle, and beat 192 the lifted final answer. The compositions and their complete MIDI downloads remain unchanged.

| Story event | Theme entrance |
| --- | --- |
| Jun's first note on borrowed power | Beat 0: the tentative opening |
| Jun carries the public hearing | Beat 32: the full statement |
| Jun announces that he finished his song | Beat 64: the contrasting answer |
| Jun's recorded premiere, heard at Nikko at sunrise | Beat 192: the completed, lifted answer |
| Aki returns the offered workshop key | Beat 192 of No Master Key |
| Her father's notebook and the memory of guarding his key | Beat 128 of Borrowed Power Waltz |
| The public hearing's evidence | Beat 64 of Carbon Copy Testimony |
| The rain scene returns after the harbor meet | Beat 64 of One Umbrella, Two Chairs |

An entrance applies only when a song is selected. Camera cuts and a later narrative cue using the same song continue from the current position, even if the new cue requests a different entrance. Diagnostics expose both `requestedEntryBeat` and the actual `entryBeat`; `startedAt` remains the real playback start time. The scheduler skips all notes before the entrance on the first pass, then loops the complete composition at its normal end. The music library always starts each complete song at zero.

`CutscenePlayer.show` notifies the main application when it draws a dialogue line. The application resolves its direction and score together. Exiting the cutscene restores the full arrangement; starting a race selects that course's existing race song. Music enable/disable and volume remain user controls. The in-scene Music button and M key toggle the score without moving dialogue; its label and pressed state stay synchronized. The dialogue log keeps keyboard focus. Recorded course music retains exclusive ownership of the music output, including already scheduled synth tails. Driving sounds have a separate effects bus.

## Validation and listening

- `npx tsx --test tests/music.test.ts tests/music-cues.test.ts` checks 25 complete MIDI files, note-on/off pairing, independently composed new melodies/harmonies/rhythms, every script position and camera arrangement, authored entrance bounds and landmarks, held dialogue, Back and audio ownership state.
- `GAME_URL=http://127.0.0.1:5203 node scripts/test-cutscene-music.mjs` renders the real Web Audio synthesizer to PCM for all sixteen themes, compares actual audio before/after a camera change and between the opening/developed premiere, checks crossfade boundaries, and confirms silence under mute and external course music. It also observes actual oscillator scheduling to confirm that a developed entrance skips earlier notes and a late entrance wraps correctly.
- `npm run test:audio` and `npm run test:external-music` retain the driving-sound and recorded-music regressions.
- `npm run assets:music` regenerates the downloadable `.mid` files.

Listening artifacts from the PCM validation are in `output/audio/cutscene-score/`: twelve seconds of each new full song, `jun-premiere-developed.wav` with eight seconds of the completed premiere, and `adaptive-score-demo.wav`, a 28-second sequence moving through the garage, deadline, rain, betrayal, Jun's premiere and the final confession. `report.json` records the measured levels, cue transitions and note scheduling checks.

The browser's `render_game_to_text()` exposes `musicState`: title, tempo, cue, narrative, mood, arrangement, five stem levels, requested and actual entry beats, transport beat, transition counts, output ownership and volume. These are presentation values and do not affect race physics, signing or settlement.
