# Period cars and builds

Every grid used to be eight identical AE86s in six colours. Now any car can be
one of six 1986 bodies, built with its own paint, wheels, aero, stance and
extras. The player builds theirs in **カスタム工房 / BUILD YOUR CAR**
(`#/custom`, from 車庫 / GARAGE). Rivals and story drivers bring their own.

Builds are presentation only. Every body races on the driving model's shared
3.9 m × 1.62 m car with the same physics. Performance comes from the
[garage tech tree](garage-tech-tree.md). Live XOR races still race RaceV1's
equal stock car; each racer's build only changes how their car is drawn.

## The bodies

The five new bodies are original SORA designs after period archetypes, generated
in code (`src/game/three/period-cars/`). The sixth is the licensed AE86
(`public/assets/models/sora-ae86/PROVENANCE.md`). Each is named for SORA's sky
(空).

| Name | Body | Archetype | Factory parts |
| --- | --- | --- | --- |
| 天空86 TENKU 86 | `hachiroku` | FR three-door hatch, the licensed AE86 | its own rims, black lower |
| 翔 MR KAKERU MR | `kakeru` | Midship two-seat wedge, pop-ups, side intakes | deep-dish wheels, ducktail |
| 北斗 GT HOKUTO GT | `hokuto` | Long-nose 2+2 fastback, slim fixed lamps | aero discs |
| 三日月 RE MIKAZUKI RE | `mikazuki` | Rotary coupe, pop-ups, curved glass hatch | five-spoke wheels, ducktail |
| 雷鳴ターボ RAIMEI TURBO | `raimei` | Four-door hardtop, quad lamps, chrome grille, round tail lamps | mesh wheels, silver lower, fender mirrors |
| 雲雀ターボ HIBARI TURBO | `hibari` | Tall hot hatch, blister fenders | eight-spoke wheels, roof spoiler |

The names are the open heavens, to soar, the Big Dipper, the crescent moon, a
thunderclap and the skylark. They avoid the period's warplane names (疾風, 雷電,
流星, 隼 and the like), which a first draft used; `tests/car-builds.test.ts`
keeps them out. In the garage each body's sky kanji (天 翔 星 月 雷 雲) stands
behind the turntable. The 13 period paints are sky colours too, from 白雲パール
WHITE CLOUD PEARL to 夜空ブラック NIGHT SKY BLACK. The six standard colours keep
their names; they are the colours live races use.

## Customization

`src/game/car-builds.ts` defines a build: 16 keys, each a known choice, validated
exactly. Unknown keys are refused, so a build can never carry performance.

- **Paint:** the six standard colours (choosing one also sets the live-race
  colour) and 13 period colours, solid, metallic or pearl.
- **Two-tone:** the body's factory scheme, one colour, black, grey, silver, gold
  or white below the side moulding.
- **Stripes:** pinstripe, twin stripes, an 80s graphic or a Group A livery, in
  eight colours. They are painted in the paint's shader from the car-space
  position and normal (`paint.ts`), so they follow every body, the AE86's included.
- **Wheels:** eight-spoke, mesh, deep dish, five-spoke, aero disc or steel, in six
  colours. On the AE86 they replace the source rims and keep its tyres, discs
  and calipers.
- **Aero:** lip or bosozoku deppa, ducktail, GT wing or roof spoiler, side
  skirts, bolt-on over-fenders with rivets (which also widen the track).
- **Stance:** slammed, demon camber (鬼キャン) or rally (lifted, with mud flaps).
- **Extras:** fog lamps or a rally light bar, rear-window louvres, a big-bore
  exhaust or takeyari (竹槍) pipes, fender mirrors.

## Who drives what

- **Practice:** your build, and a field of rival cars from fixed seeds
  (`practiceCars`). Club night's regulars run nearly stock; Legends run flares,
  wings and demon camber.
- **Story:** the crew drive the AE86 the cutscenes draw, each with their own
  touches (Ren's pink graphics, Daichi's rally lamps). Rei brings a silver
  三日月 RE, Toru a black and gold 北斗 GT, and the host clubs' guests their own
  cars, the dawn club's taxi included (`storyCar`).
- **Street routes:** the same cars by driver name, practice and story.
- **Live races and spectating:** each racer announces their build in a signed
  `build` packet (`src/network/appearance.ts`), beside the appearance packet,
  to the other racers and the public spectator feed. The session's input key
  signs it, bound to the session scope and the racer's slot. A build cannot
  change during a session, and forged, altered, cross-session or unknown builds
  are rejected. A racer who announces none, or whose client predates builds, is
  drawn as the factory AE86; an older client rejects the new packet without
  touching the race and keeps drawing everyone as before. Builds never reach
  RaceV1's physics, the proof transcript or settlement.

An equipped NFT livery ([SORA Custom Works](collectibles.md)) repaints a build,
as it repaints the factory car; the build keeps its body, wheels and parts.

The player's build is saved as `sora-cars:car-build:v1`. Local Arcade replays
(`SoraDriveV1`, `SoraGarageV1`) and exported multiplayer RaceV1 replays record
each car's build (null for a live racer who announced none) and replay it. Earlier
replays have none and replay as before. The street replay format is fixed by the
native proof tooling, so street replays carry no builds: they show the player's
current build and the drivers' own cars.

## Rendering

`shell.ts` lofts each body from its `BodySpec` (`bodies.ts`): sections along the
length (rocker, side, shoulder, top), with the wheel arches cut in. A greenhouse
is lofted over it with side glass, pillars, windscreen and backlight. Bumpers,
mouldings and seals are swept profiles, and the lamps, grille, plates and
interior are added after. Geometry is grouped by material and by breakable panel
in the damage model's bit order (`CAR_PARTS`), so bonnets, boots, doors, lamps,
bumpers, plates and mirrors break away like the AE86's. Kit parts bolted to a
panel fly off with it.

Materials take the AE86's names (`Primary`, `Windows`, `LicensePlate`,
`TailightFrame`, `LampCovers`), so the pixel-art car stages find plates, tail
lamps and cabins on every body. Every car carries the exact SORA flag on both
doors, the emblem on its roof and bonnet, and the club strip on its backlight.
A detailed seated driver sits on the right-hand seat. Bodies and kit parts share
geometry; a car owns only its materials. `fleet.ts` swaps each grid slot's model
when its build changes. The factory AE86 is the original detailed fleet,
untouched.

`?cars=stock` races every car as the factory AE86 again, for comparison.

A period car is about 20,000 to 24,000 triangles in about 70 meshes, where the
AE86 is 706,000 triangles in about 40 draw calls. On 1 November 2026 a Legends
start at Hakone measured 30.4 ms a frame with builds, against 29.6 and 32.3 ms with
`?cars=stock` either side of it (headless Chrome on Metal, 120 frames after
warm-up, with other sessions running). The difference is within the noise.

`car-lab.html` shows every body side by side under the race's dusk HDR:
`?body=<id>`, `?build=<json>`, `?seed=<n>&flair=<0-1>`, `?grid=story&chapter=<n>`
or `?grid=<field>`, with `?view=three|rear|front|side|top`. The AE86's kit
anchors (`hachiroku.ts`) were measured there with `carLab.measureHachiroku()`.

## Tests

- `tests/car-builds.test.ts`: build validation and saves, the factory car, sky
  names, rival and story cars, replays with builds.
- `tests/live-builds.test.ts`: signed build packets, spectators, live
  controllers and RaceV1 replays with builds. `scripts/test-spectator.mjs` checks
  the same over real WebRTC and the relay: two drivers and two observers draw
  both racers' builds.
- `tests/period-cars.test.ts`: each body's size and contacts, the pixel-art
  material names, the SORA decals, breakaway panels, every kit part on every
  body (the AE86 included), wheels, stance and stripes.

## Known limits

- Bodies are procedural, so in **Picture → Pixel finish off** they read simpler
  than the scanned AE86. The pixel finish, on by default, draws them in the
  cutscene style.
- The sedan (4.44 m) and the GT (4.40 m) overhang the shared collision box by up
  to 0.27 m at each end, and the hot hatch (3.72 m) falls short of it by 0.09 m.
  Contacts are computed on the shared car.
- The underbody shadow is the AE86's baked one on every body.
