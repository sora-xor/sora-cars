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

## Town themes for the street-race chapters

Each street-race chapter has its own cutscene theme. The five themes are written and scored like the story themes: 64 bars, two hooks, their own chord routes, and the same cue entrances. They live in `src/game/story-place-themes.ts`, outside the released soundtrack library, so the 25 downloadable compositions, their renders, MIDI files and sleeves are unchanged. Cue sheets address them from track 100 upward. The races themselves play each route's own song.

| Song | Musical character | Dramatic role |
| --- | --- | --- |
| Akechidaira Teahouse (明智平の茶屋) | 96 BPM, D major; koto lead, bells, a pentatonic climb | The Nikko club, the twenty curves and the overlook at sunset |
| Kudan Before Dawn (九段、夜明け前) | 112 BPM, A dorian; sync lead, glass arpeggios, city-pop bass | Tokyo before dawn: mini-FM, the printer and the first trains |
| Red Ink, Black Lacquer (朱と漆) | 78 BPM, G minor ballad; koto and FM bells over hollow pads | The apology in Aizu and the hill facing the castle |
| Canal Current (疏水の流れ) | 104 BPM, F lydian; motorik pulse, sequenced bass and running arpeggios | Keage's canal and power station, and the notices in Gion |
| A Handful of Earth (一把の土) | 90 BPM, A♭ major; FM reed over electric piano and voice pads | Nara: the deer, the drummer's coffee shop and Wakakusa-yama |

The street chapters' cue sheets also bring back story themes where a scene answers them:

- Glass Permission as Ren hands away the microphone in Tokyo;
- Dead Air Confession at the empty relay shelf in Aizu;
- One Umbrella, Two Chairs on the Kamo riverbank;
- Jun: The First Light when his old drummer calls, and again when the four new bars play in Nara.

## Scoring behavior

`src/game/music-cues.ts` contains explicit dialogue positions for all 17 introductions and 17 victory scenes, plus the retry scene. Cue sheets are in chapter-id order. A cue's name describes the actual dramatic event. Music is not selected by chapter modulo, random index, or speaker identity.

Camera direction changes the arrangement while the song keeps its place:

- Wide shots open the stereo field and bring in the ensemble and rhythm.
- Left close-ups foreground the lead melody and reduce drums and arpeggios.
- Right reverse angles answer with arpeggios and a firmer bass pulse.
- Details foreground glass/bell ostinatos and pads, with restrained bass and percussion.

Scene and dramatic mood also shape brightness and instrument levels. A new camera arrangement settles over a short, smooth parameter ramp. Held dialogue, text reveal, the dialogue log, and motion pause leave the musical transport running; Back restores the cue appropriate to that earlier line. The cue sheet can change a scene's mood without restarting its theme, such as the admission and rejection within the blackout.

### Transitions and silence

Each cue names how the score reaches it, so the music moves the way the scene does:

| Transition | Sound | Used for |
| --- | --- | --- |
| `fade` (default) | The outgoing song plays on under a 0.72 s fade while the next arrives over 0.78 s | Ordinary turns in a conversation |
| `cut` | The old song is gone within 40 ms and the next starts at once, without a click | Interruptions and decisive turns |
| `slow` | The old song plays on under a 2.6 s fade; the next swells in over 3.2 s | Intimate turns, and fading into or out of silence |
| `powerdown` | Notes stop, the effects are no longer fed, and the music and its echoes collapse to a 60 Hz thud in 0.35 s before the level is gone at 0.8 s | The 2 a.m. blackout |

A cue with no composition is a deliberate silence: nothing plays until the next cue. Skipping out of a scene during a silence brings its last song back with a slow fade.

| Story event | Score |
| --- | --- |
| Ch. 1: “This is less sweet” — the bank's notice | Cut to Three Weeks of Paper |
| Ch. 5: Rain begins once Aki and Ren are alone | Slow fade into One Umbrella, Two Chairs |
| Ch. 5: The sponsor's call interrupts Ren's confession | Cut to Glass Permission |
| Ch. 6: Celeste calls about Ren's list of relay hosts | Cut to Glass Permission |
| Ch. 7: Two o'clock — the broadcast power is gone | Power-down into dead air for two lines, then Dead Air Confession swells in slowly as Aki asks how they knew |
| Ch. 8: Her father's notebook | Slow fade into Borrowed Power Waltz |
| Ch. 8: Aki gives up the recovery key she kept | No Master Key, full statement (it was Open Circuit Breakfast) |
| Ch. 10: Aki returns Celeste's key | Cut into No Master Key's lifted final answer |
| Ch. 10: “Their line's been cut” | Cut to Two A.M. Relay |
| Ch. 11: Celeste, the same morning | Cut to Crown on the Grid |
| Ch. 12: Ren leaves silence after Jun's song | Jun's premiere fades out slowly; Aki's “I love you” is spoken into the silence, and Side B: Press Record swells in as Ren answers |

Two other cues changed to match the scene: in chapter 3, Aki keeping the recovery key to herself now uses Three Weeks of Paper (her concealed anxiety) rather than the evidence theme, and Borrowed Power Waltz carries on through her first step towards asking for help instead of switching to No Master Key.

Before October 29 every fade dropped the outgoing song almost at once. A layer's fade began with `cancelAndHoldAtTime`, which inserts no event once a ramp has finished, so the new ramp was anchored at the end of the earlier fade-in and the gain jumped most of the way down. The transport had also stopped scheduling the old song's notes the moment a cue changed. Fades now ramp from the parameter's present value, and an outgoing song keeps being scheduled into its fading layer until its fade ends.

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

The PCM validation also measures each transition against the same music crossfaded normally, scheduling notes only a moment ahead as the live timer does: a cut leaves about a ninth of a crossfade's level just after the switch; a power-down's treble-to-mid balance falls below half a crossfade's before dead air; a slow swell starts at about a quarter of a crossfade's level and then plays at full level; and a slow fade-out keeps the song playing (about 90% at first, about half midway) before the silence becomes real.

Listening artifacts from the PCM validation are in `output/audio/cutscene-score/`: twelve seconds of each new full song, `jun-premiere-developed.wav` with eight seconds of the completed premiere, `adaptive-score-demo.wav`, a 28-second sequence moving through the garage, deadline, rain, betrayal, Jun's premiere and the final confession, and `story-transitions-demo.wav`, 32 seconds through the sponsor's call, the 2 a.m. power-down, the betrayal swelling out of dead air, Jun's premiere, Ren's silence and the love theme's answer. `report.json` records the measured levels, transitions, cue boundaries and note scheduling checks.

The browser's `render_game_to_text()` exposes `musicState`: title, tempo, cue, narrative, mood, arrangement, five stem levels, requested and actual entry beats, transport beat, transition counts, output ownership and volume. These are presentation values and do not affect race physics, signing or settlement.
