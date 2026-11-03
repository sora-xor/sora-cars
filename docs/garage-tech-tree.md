# Garage tech tree

The garage now has a **整備ノート / tech tree** (`#/tuning`, from 車庫 / GARAGE).
Prize money earned in local practice and story races buys performance parts. In
story mode the tree also opens by itself after each chapter's cutscenes, as the
**pre-race garage** (below). Parts change only those local races. **Live XOR races and the Tokyo street run
always use the equal-performance stock car**, as
[performance-classes.md](performance-classes.md) requires: no per-player
multipliers ever reach a staked session, a proof or a RaceV1 transcript.

## Where it applies

| Mode | Physics | Opponents |
| --- | --- | --- |
| Practice, 練習 | Your fitted parts | The selected practice field |
| Story, 物語 | Your fitted parts, set in the pre-race garage before each chapter's race | Crew in stock cars; Rei Sorashiro and Toru Amamiya tune up as the plot escalates |
| Either, with **全車ノーマル / EQUAL CARS** on | The stock car for everyone | The original stock practice and story grids |
| Live XOR races, spectating, Tokyo street run | Unchanged | Unchanged |

Practice and story races run on the rigid-body driving model
([driving-model.md](driving-model.md)), where `vehicleSpec` turns every tune
field into a property of the car (below), and save `SoraDriveV1` replays with
every car's tune. With `?physics=native` they run on RaceV1 instead: an
all-stock race on the native kernel, and a tuned one on
`src/game/tuned-engine.ts`, a parameterised copy of the RaceV1 step that
reproduces the native circuit tick for tick with `STOCK_TUNE` (checked on all
tracks and grid sizes by `tests/garage-tech.test.ts`). Those tuned races save a
separate `SoraGarageV1` replay that records every car's tune and the RaceV1
rules hash it was derived from. It re-simulates exactly, and it is never
accepted as a RaceV1 transcript. The balance below is measured on the driving
model only.

### How parts act on the driving model

Tune fields keep RaceV1's scale, so the garage's km/h and seconds read the same,
and `vehicleSpec(STOCK_TUNE)` is exactly the stock car: equal-car races and their
replays are unaffected by the garage.

| Fields | Driving model |
| --- | --- |
| `topSpeed`, `boostSpeed` | The rev limiter and the boost limiter (mm per tick × 0.03 = m/s). A bigger turbine also makes more boost power, as the cube of its top speed, because a burst rarely lasts long enough to reach the limiter. |
| `accel` | Engine power: 55% fixed, 45% scaled by the field. |
| `coast` | Engine braking with the throttle off, 120 N per point at the rear axle. Keyboard drivers lift whenever they head for the outside rail, the AI almost never, so the high-rev six (more) and the torque six (less) split them. |
| `boostCost`, `boostRecharge`, `boostKick` | Energy per tick out of 1,000; anti-lag adds 180 N of push per point while boosting. |
| `traction` | Extra rear-tyre traction below 160 km/h, for launches and recoveries. It stops paying once the engine, not the tyres, limits the launch, at about +10%. |
| `cornerLoad`, `dryDamping` | Tyre grip, 2% per point. |
| `rainSteer`, `wetDamping`, `oilSteer` | Grip in rain and on oil, as shares of the dry road's. |
| `windLoad` | Crosswind push. |
| `steer`, `driftSteer` | Steering lock, and how far the rear lets go in a drift. |
| `offroadLoss` | Friction against the guard rails, as the square of the field's ratio to stock: Arcade rails stand just beyond the road edge, so leaving the road means scraping one. Beyond a street route's edge it is also the verge's drag. |
| `contactLoss`, `treeLoss`, `signLoss` | Toughness: damage per hit, 50% from car contact, 30% from rail and tree impacts, 20% from props. |
| `driftCharge` | Boost energy each tick of a drift through a bend, steering into it at more than 90 km/h: half a point per point of the field in a tight corner (380 m radius), scaled by the bend's curvature, up to double. |
| `draft` | In another car's wake (5–26 m behind, within 1.6 m), more drag removed and the limiter raised by the field (mm per tick × 0.03 = m/s). |

## Story mode: the pre-race garage

Every chapter runs: opening cutscenes → **出走前の整備 / pre-race garage** → race →
victory or retry cutscene → results. Retries and the next chapter both pass
through the garage again. It is the tech tree with tonight's race on top
(`src/game/story-pit.ts`, view `pit`, not a URL of its own):

- **Course, weather, roadside and objective.** Weather and roadside objects are
  read from the native environment over a stock car's race distance. Hakone has
  rain for 25% of the race and a light crosswind, Yokohama 50% and a strong one,
  Nikko 20% and a gusty one.
- **A crew tip and pick.** Yui briefs Hakone, Daichi Yokohama and Jun Nikko (the
  player drives Aki's car). The pick is the next step of that course's plan,
  bought, or swapped back in, with one click from the briefing. The detail panel
  opens on it, and the branches the tip names are highlighted in the tree.
- **Tonight's grid.** Rei's and Toru's build values beside yours. The five crew
  cars are always stock. With equal cars on, everything reads stock.
- **出走する / START THE RACE** continues the chapter. Leaving through the
  navigation drops the chapter.

After a story race the prize box says the money can be spent in the next
pre-race garage, instead of linking away to the tech tree page.

### Course plans

Each course has a fixed purchase order, `COURSE_TIPS[track].plan`, and the pick
is the first step the car still lacks. The plans are held to story races
(`tests/story-pit-balance.test.ts`). On Hakone's and Yokohama's first nights
(IDs 0 and 1), a rookie on the crew's picks arrives with the car and money story
mode gives them after clearing every earlier chapter on the first try, in 2nd
place or with clean wins (`PLAN_VISITS`). Whatever the plan buys there must meet
the objective within five points as often as any other use of the money:
buying nothing, buying any one part on offer, or stopping the plan early. Every
option is raced over the same 256 seeds.
`npm run balance:garage` prints every option's rate, and, for comparison, the
best clear-road time per yen from a stock car.

| Course | Crew | Opening of the plan |
| --- | --- | --- |
| Hakone | Yui | Intake → boost controller → intercooler → tyres → big turbine → coilovers → cams |
| Yokohama | Daichi | Intake → boost controller → cams → intercooler → torque six → big turbine → tyres → coilovers → rally |
| Nikko | Jun | Intake → roll cage → boost controller → intercooler → tyres → coilovers → twin turbo |

On the current report Yui's intake podiums 98% of the time on Hakone's first
night (nothing 93%, controller 96%, tyres 76%, cage 77%), and Daichi's
controller 52% on Yokohama's (nothing 40%, tyres 28%, cage 30%).

Until November 2026 each step was the part that saved rookies and regulars the
most time per yen on a clear road from a stock car. That rule put sport tyres
second in Yokohama, where story races show they cost a rookie podiums. Probes
raced 512 paired seeds on the first harbor night, rookies with Yui's intake, on
the driving model before `84c6866`.
Daichi's boost controller lifts a first-try podium from 44% to 55%, and adding
the tyres takes it back to 46%. On their own the tyres (34%) and the roll cage
(36%) do worse than buying nothing.

The cause is the start. The player starts 7th, 1.6 m behind the crew car in
5th, and the tyres' extra launch traction runs a rookie into that car in the
first second. That costs 1.0 s of contact by 1 s instead of 0.5 s, 137 km/h at
2 s instead of 162, and about 20 m by 10 s, which the race never gives back.
Taken apart, launch traction alone costs 10 points. The tyres' grip and oil
grip change nothing measurable, and rail time is the same with them. Regulars,
who steer clear at the start, lose nothing to the tyres. On a clear road the
tyres save 0.4 s, which is why time per yen liked them.

A harbor pack rewards top speed instead. Intake, controller and cams podium 73%
of the time, against 65% with the intercooler in place of the cams. The rest of
Daichi's plan follows the later harbor nights:

- The second night (ID 4) is where the cams usually get bought: 66% against
  54% for saving, which the old plan did.
- On the third (ID 7) the torque six is within two points of the best buy.
- On the showdown (ID 10) the engine fork is the biggest gain in the story: 80%
  against 55% for saving toward anti-lag, again the old plan. With `84c6866`'s
  engines the torque six still leads (79%, against 72% for the high-rev six and
  62% for saving, 256 seeds).

Over 256 paired rookie campaigns the new plan cuts the four harbor nights from
6.9 to 5.8 races and the whole story from 15.7 to 14.4, with no chapter worse.
Regulars are unchanged. The chassis has its place later: once the car has tyres
and a cage, the rally setup is the best buy on the third harbor night and keeps
the car off the rails. Daichi now says intake first, then boost, and to wait
for room ahead before pushing.

Jun's Nikko plan is not held to its first night yet. There a rookie does better
stopping at the roll cage and intercooler (87%) than with the tyres Jun adds
(82%). After clean wins the cage alone (87%) beats his cage, tyres and coilovers
(72%). Moving his tyres and coilovers after the cams and twin turbo fixed that
night (+9 points) but cost the third harbor night 11, so Jun's plan needs its
own pass through the story races.

The pick skips a fork the player settled on the other option. Buying a fork
option fits it only if the car has neither option fitted; one bought while the
other is fitted goes into storage, and the fitted one stays until the player
swaps, free. When the plan's option is the stored one, the pick is to swap it
in.

## The tree

Four branches, each with two linear tiers, a tier III **setup fork** and a tier
IV capstone. You may own both fork options and swap them for free between races.
The first option bought is fitted. While it is, the other option's button reads
購入して保管 / BUY & STORE instead of 購入して装着 / BUY & FIT, and buying it puts
it into storage. Every capstone needs a part from another branch.

| Branch (crew) | I | II | III (fork) | IV |
| --- | --- | --- | --- | --- |
| エンジン ENGINE (Aki) | Intake & exhaust ¥10k | Cams & ported head ¥24k | High-rev six ¥52k / Torque six ¥52k | Full-tune six ¥64k (+ Intercooler) |
| ターボ TURBO (Jun) | Boost controller ¥12k | Intercooler ¥24k | Big turbine ¥56k / Twin turbo ¥56k | Anti-lag ¥120k (+ Cams) |
| 足回り CHASSIS (Daichi) | Sport tyres ¥6k | Coilovers ¥8k | Touge setup ¥48k / Rally setup ¥18k | Mechanical LSD ¥80k (+ Boost controller) |
| ボディ BODY (Yui) | Roll cage ¥4k | Reinforced bumpers ¥7k | Lightweight ¥30k / Steel armor ¥8k | Wind-tunnel body ¥78k (+ Coilovers) |

One full path costs ¥571k–623k; every part costs ¥757k. Effects are in
`TECH_NODES` (`src/game/garage-tech.ts`), and each part carries a `bestFor` tag
that the page shows beside its measured seconds a race ("FOR DRIFTERS"). The
balance tests hold each tag to its promise. Prices follow what each part is
worth on the driving model: turbo parts cost the most, and the durability parts,
which mostly protect the car, the least.

Four garage-only mechanics are zero at stock, so RaceV1 never sees them:

- **Drift charge** (Touge, LSD): holding a drift through a bend while steering
  *into* it at speed refills the turbo, more in tighter bends. Steering out of
  the bend charges nothing, so wiggling the wheel does not pay. Ace drivers with
  these parts drift through every bend.
- **Slipstream** (Wind-tunnel body): the speed cap rises in another car's wake,
  5–26 m behind and within 1.6 m.
- **Anti-lag**: extra push while boosting, so short bursts reach boost speed
  sooner.
- **Traction** (Torque six, tyres, cage, bumpers, rally, armour): extra rear-tyre
  traction below 160 km/h for launches and recoveries.

The race HUD shows ドリフト充電 / DRIFT CHARGE and スリップストリーム /
SLIPSTREAM chips while those mechanics are working.

### Reading a part

Each card shows what the part does at a glance. Arrows rate it on the garage's
five car stats (最高速 top speed, 加速 acceleration, ブースト boost, 安定 stability
and 耐久 toughness). A chip names any special mechanic it adds, and trade-offs
show in red. The arrows come from the part's change on the stat bars'
stock-to-finished scale (`src/game/part-effects.ts`).

Selecting a part shows:

- **Seconds saved a race** on Hakone, Yokohama and Nikko for the drivers its tag
  names, measured on the driving model (`RACE_GAINS`, held to the balance report
  by the balance tests). The pre-race garage marks tonight's course, and the
  crew's pick quotes it.
- **On your car:** every change as the driving model reads it, from your current
  car to the car with the part fitted (or without it, for a fitted part): km/h,
  seconds of boost, engine power, tyre, rain and oil grip, rail scrape and damage
  per hit as percentages. Fields the model folds into one quantity (the three
  impact losses into damage per hit, the two rain fields into rain grip) share a
  line. A fork option also lists what the other option takes with it, so a swap
  shows its trade-offs.
- **The stat bars preview the part:** green where it gains, striped red where it
  costs.

## Parts in 3D

Every part spins in 3D: an icon on its card, a turntable in the detail panel
(drag it to spin), and the crew's pick in the pre-race garage. Buying or swapping
a part in flashes it, rings the deck, throws sparks and stamps 装着！ / FITTED!.
A fork option bought into storage gets none of that; it shows 保管中 / IN STORAGE.

- `src/game/three/part-models.ts` builds the 20 models from primitives, so nothing
  extra downloads. Each carries the exact SORA emblem once, centred on its main
  face. Some parts move: the compressor wheels, the camshafts, the boost gauge's
  needle, the anti-lag flame and the LSD's ring gear.
- `src/ui/part-viewer.ts` draws every part canvas with one offscreen WebGL
  renderer. With the pixel finish (the default) each part is supersampled 4×4,
  resolved to one art pixel per 2 CSS pixels, matched to the cutscene palette in
  OKLab and outlined in the cutscene ink, like the race's pixel-art renderer. With
  the finish off, parts render smooth at display resolution.
- The lighting follows the cutscenes: an amber key, a violet rim and a cool fill.
  There is no reflection map, because its shaders stalled the first visit for
  about 0.6 s.
- All parts share three shader programs (plain, carbon and the emblem decal).
  They compile in the background after the page paints, so on the first visit the
  parts appear about a second after the tree. Off-screen canvases pause, idle
  icons turn at half rate, and reduced motion holds a three-quarter view (dragging
  still works).

## Economy

- New garages start with ¥12,000, enough for a first part.
- Purse by place: ¥6,000 / 4,500 / 3,500 / 2,800 / 2,200 / 1,700 / 1,300 / 1,000,
  plus ¥1,000 for a **clean run** (no tree or sign impacts, at most one second off
  the road). Practice fields multiply both: Club ×1.0, Touge ×1.6, Championship
  ×2.4, Legends ×3.4. Story races pay ×1.2.
- Each story chapter's first clear pays a one-time bonus of ¥8,000 + ¥1,500 per chapter.
- A podium in a field unlocks the next one.
- Replays, spectating and live races never pay.

## Opponents

| Field | Rival builds | Drivers |
| --- | --- | --- |
| Club night | Stock | Club |
| Touge battle | ¥24k–96k | Club and pro |
| Championship | ¥72k–288k | Pro |
| Legends | ¥160k–640k | Pro and ace |

Rival builds spread from 40% to 160% of the field's budget through the grid, so
mid-pack finishes are common and a podium needs a build near the field's median.
Builds follow three purchase orders (power, boost, tough) through the same tree
and prerequisites as yours. On the driving model the rivals are `DriveAI`
drivers (`src/game/drive/ai.ts`), and boost use is what separates them, because
the Arcade circuits are flat out (below):

- **Club** drivers, your crew and the club-night regulars, never fire the boost.
- **Pro** drivers wait for 85% of a tank and hold the burst; **ace** drivers wait
  for 95%. Both boost past a car once their path is clear.
- **Ace** drivers drift through every bend when their build has drift charge.

Story rivals use `STORY_REI` / `STORY_TORU`: Rei from chapter ID 2 (boost build,
pro driver) and Toru from ID 3 (power build, club driver). Since every chapter
opens with the pre-race garage, the budgets assume a player who upgrades. Rei
contests the lead through Act 3 with ¥120k, ¥160k, ¥160k and ¥180k (IDs 8–11):
on the November 2026 handling her ¥150k–210k cars beat a regular following the
crew's picks by 0.7 s on average, where the design wants that regular narrowly
ahead. Toru's showdown (ID 10) build is ¥60k with the pro driver, which needs
parts.

## How it was balanced

Every number comes from simulated races on the driving model, with reference
drivers in `tests/helpers/garage-drivers.ts`:

- **Rookie** and **regular** are keyboard players. They steer from what the car
  did a moment ago (0.2 s for a rookie, 0.17 s for a regular), aim about a second
  ahead, allow for only part of each bend, tap the keys rather than hold a steady
  angle, have lapses, lift and then brake when they head for the outside rail of
  a bend, pick a side to pass a car and keep to it, and never boost into the back
  of a car. A rookie boosts only with a full tank, on a straight; a regular from
  80% of one. Seeds vary their lane, judgement and lapses; lapses are tied to the
  road, so a run with and without a part meets them at the same places.
- **Club**, **pro** and **ace** are the opponent AIs.

On a clear road a rookie is 2–3.5% slower than a pro, a regular 1–2.5% and a
club driver 4.5–5%; in a pack the humans lose more. Each part is measured along its
unlock path on all three tracks: on a clear road (40 rookie seeds, 12 regular
seeds, one run per AI driver), or, for the pack-racing wind-tunnel body, from
every grid slot of a club night. Gains are interquartile means of paired runs,
so one spin or wreck does not swamp the rest. A driving-model race costs a few
hundred milliseconds, so the measurement runs on every core and writes a report
that the tests check (about 23,000 races; 34–68 minutes on 15 workers,
depending on what else the machine is running):

```sh
npm run balance:garage            # writes tests/fixtures/garage-balance.json
npm run balance:garage -- --quick # rough numbers for iterating, writes tmp/
```

The tests re-run six fingerprint races (every driver kind, drift, slipstream,
tuned rivals) and compare them bit for bit with the report, and they hash the
tree's effects, prices, rival budgets, crew plans and reference drivers. Any
change to the model, the AI or those inputs fails them until the report is
re-measured.

`tests/garage-balance.test.ts` enforces the resulting limits:

- Every part saves at least a tenth of a second (3 ticks) a race for the drivers
  its tag names. `RACE_GAINS`, the seconds the cards show, match the report.
- Each tier is a worse deal than the one before, so the capstone is the costliest
  gain in every branch. Value per yen differs by at most 3× within a tier.
- Every fork is a real choice: each option saves its own tag's drivers more time
  per yen than the other. High-rev beats Torque for clean drivers and loses for
  rookies and regulars. Touge beats Rally for drifters and loses for recovery.
  Lightweight beats Armour for clean drivers; Armour, at under a third of the
  price, is the better buy for recovery and takes at most 70% of the damage per
  hit. Big and Twin turbines each win on some track or for some driver.
- The two engines used to give every driver about the same time: over 160 rookie
  and 60 regular seeds, within a tick either way. They now split the drivers by
  what only keyboard drivers do, lifting for the outside rail and scraping it.
  The high-rev six brakes harder off the throttle (`coast` +4) and scrapes a
  little harder (`offroadLoss` +5). The torque six rolls on (−6), scrapes less
  (−5) and keeps +2 of top speed (was +6). Over those seeds the torque six now
  saves rookies and regulars 2.5 ticks a race more than the high-rev six, which
  saves pros and aces 3.1 more. The tune bounds leave the engines no more rail
  room beside the rally setup, lightweight and armour.
- Steel armour costs ¥8k (was ¥9k). At ¥9k it tied the lightweight body for
  recovery drivers even over 160 rookie and 60 regular seeds (0.40 ticks a race
  per ¥1k each). The plan's 40 and 12 seeds put it behind, at 3.0 ticks a race,
  and past the tier's 3× spread. At ¥8k it leads by 12% over the larger sample
  (0.45 against 0.40) and 7% on the plan's seeds.
- A finished car is 8–16% faster than stock (12.5–14.6% measured).
- The fields form a ladder for a pro starting 7th, raced in 32 lanes on each
  track, 0.15 m apart and within 2.4 m of its line (96 races per build; it was
  eight lanes 0.3 m apart, 24 races). Lanes further out run beside the rail: at
  0.3 m steps a ¥120k car podiumed Championship only from 3.9–4.5 m off its
  line. One AI race is chaotic. A finished car placed 4th, 4th and 7th from that
  grid spot and podiumed 15 times in 18 from the slots around it. A car boxed in
  from the start can sit behind the pack all race and never boost: ¥60k placed
  4th that way in one club-night race of 24, while it podiums 95 times in 96. So
  a rung that always podiums, or never does, may lose at most two of its 96
  races the other way. That is sharper than every one of 24 races, both ways. A
  true 95% podium rate fails it 86% of the time (71% for 24 of 24), and a true
  99% rate passes it 93% of the time (79%). A stock car cannot podium club night
  every time, but ¥60k always does. Touge and Championship never podium a stock
  car and ¥120k respectively and always podium ¥420k; Legends never podiums
  ¥180k, and a finished car podiums at least two times in three (83 of 96).
  Legends' rivals are built from ¥400k: at ¥420k one of them carried the
  wind-tunnel body and, with passes slower on the gentler keyboard wheel, a
  finished car podiumed only 11 times in 24 (20 on the earlier handling).
- With equal cars a regular clears every story chapter at least half the time
  (Hakone and Nikko 11 times in 12 or more, Yokohama 8 in 12). Against the
  tuned rivals a stock regular still wins through the harbor chapters IDs 4 and 7
  more often than not.
- On the first harbor night (96 seeds) a rookie with the crew's picks as rookies
  have them there, Yui's intake and Daichi's boost controller (¥22k), clears it
  50% of the time: three times as often as in a stock car (16%), and over twice as
  often as when the same funds (¥25.4k after a Hakone second place) go
  cheapest-first on tyres, coilovers, a roll cage and bumpers (¥25k, 19%). The
  report keeps every seed's result, and the test holds the picks at least 20
  points above stock and 10 above cheapest-first, with the seed-by-seed gain
  above zero at a one-sided 95% bound (0.21 measured: the picks win 36 seeds
  that cheapest-first loses, the reverse 6). ¥46k of engine and boost
  parts clears it 56% of the time: a harbor pack race rewards top speed, and a
  rookie cannot afford those parts by then. This check used to compare Daichi's
  three picks (¥28k) with ¥46k of engine and ¥32k of chassis parts on 12 seeds;
  the picks only came out ahead by chance (at 36 seeds the engine parts won on
  the earlier handling too, 39% to 33%).

`tests/story-pit-balance.test.ts` plays the story's Arcade chapters the way
story mode runs them: pre-race garage, race, prize money, retry until cleared.
It plays 64 seeded runs per driver, with four garage habits: the crew's
picks, cheapest part first, priciest part first, and never buying. With eight,
the Act 3 lead moved by a second between runs. With sixteen, a stall that 64
campaigns put at 1 in 64 landed inside the sample. A chapter still uncleared
after 15 tries counts as a wall. It holds:

- On Hakone's and Yokohama's first nights (`PLAN_VISITS`), what the crew's plan
  buys meets the objective within five points as often as buying nothing, any
  one part on offer, or stopping the plan early (256 paired seeds, rookies).
- On the crew's picks, rookies and regulars never stall. The Yokohama chapters
  average at most four races; every other chapter, at most two.
- Never buying stalls rookies in the Yokohama chapters (in at least half the
  runs) and takes more than one and a half times the races of following the
  picks.
- Casual buying (cheapest or priciest first) stalls at most one campaign in
  64 per habit and driver. A habit that walls off 5% of players fails that 84%
  of the time (56% for none in 16), and one that walls off 1% passes it 86% of
  the time (85%). The crew's picks must never stall.
- In Act 3, a regular on the crew's picks beats the faster of Rei and Toru on the
  first try by under two seconds on average (0.8 s); casual builds (−1.1 s and
  −0.8 s) and rookies (−2.7 s) lose that first race to her.

| Garage habit (64 runs each) | Races to finish the story | Act 3 lead over the faster rival |
| --- | --- | --- |
| Crew's picks: rookie / regular | 14.5 / 12.1 | −2.7 s / 0.8 s |
| Cheapest first: rookie / regular | 19.0, 1 stall (ID 1) / 12.5 | −3.5 s / −1.1 s |
| Priciest first: rookie / regular | 15.0 / 12.2 | −2.7 s / −0.8 s |
| Never buys: rookie / regular | 43.5, stalls in Yokohama / 23.0, stalls at the showdown | −6.9 s / −4.5 s |

Cheapest-first rookies still stall once in 64, on the first harbor night (ID 1).
They clear only 22% of tries there (63 in 285), because the roll cage and tyres
they buy first run a rookie starting 7th into the car ahead (see the findings
below). The check passes with that one wall but sits near its limit; the
start-line nudge is left for a follow-up.

### Findings that shaped the tree

- **The Arcade circuits are flat out.** Their bends are 253–760 m in radius, and
  the car's grip and downforce take them at boost speed, so no driver brakes for
  a bend. The engine's surplus at the rev limiter recovers small speed losses in
  moments. Race time is the limiter, the boost and the start, which is why
  grip, steering lock and oil grip save next to nothing.
- **Long bursts gain far more than short ones.** A burst's extra speed coasts
  down slowly, so the distance it gains grows with the square of its length. The
  boost limiter was never reached, so the big turbine now also adds boost power.
  The AI's thresholds were inverted (the ace boosted soonest), and a car blocked
  by traffic never boosted at all, so the field never passed.
- **Durability buys little time.** Clean drivers take almost no damage, and
  even rookies end a race with 3–9 points and wreck about once in 360 races. The
  cage, bumpers and armour therefore also add launch traction, rail friction or
  crosswind resistance, and cost a few thousand yen.
- **Traction saturates.** Below 160 km/h the stock car is limited by its rear
  tyres, but from about +10% of traction the engine is, so stacking traction
  parts stops paying.
- **The story's crew had become unbeatable.** With equal cars on flat-out
  circuits nobody passes, and the club AI held its line and boost perfectly.
  Club drivers no longer boost, so a rookie with the crew's first picks can win
  the first chapter. Toru's showdown car came down from ¥90k to ¥60k, where
  rookies on the crew's picks stopped stalling.
- **Launch traction loses a story race from the player's grid spot.** The
  player starts 7th, 1.6 m behind the car in front, so tyres or a roll cage on
  an otherwise stock launch run a rookie into it at the start. Those parts pay on
  a clear road and cost podiums in story races, which is why the course plans
  are now held to story races rather than clear-road time per yen.
- **Buying a fork option used to fit it, which walled casual shoppers.** They
  buy the cheap recovery options first (steel armour ¥8k, rally setup ¥18k) and
  the dearer clean and drift options later (lightweight ¥30k, touge ¥48k). All
  64 cheapest-first rookie campaigns reached the showdown racing the lightweight
  body and touge setup they bought last, with armour and rally in storage.
  Racing each campaign's showdown car 8 times, they cleared 22.7% of tries, and
  35.7% with armour and rally fitted instead (+13.1 ± 2.6 points, paired by
  campaign). Toru's car was not the lever: with it at ¥55k, ¥50k or ¥40k instead
  of ¥60k, cheapest-first rookies walled 1, 1 and 2 times in 64 (3 at ¥60k) and
  cleared 24.7%, 26.4% and 20.6% of showdown tries (23.4%), no trend at a
  standard error of about 2.7 points. Since November 2026 an option bought while
  the other is fitted goes into storage. Cheapest-first rookies now clear 38.6%
  of showdown tries and stall once in 64 (was three); priciest-first rookies
  clear 59.3% (was 43.2%) and never stall (was once). Casual regulars keep the
  recovery options they bought first, so they clear the showdown less often
  (70.3% and 85.3% of tries, from 91.4% and 95.5%), but they never stall, and
  Rei still beats them in Act 3. The crew's plans never buy both options of a
  fork, so the rest of the report did not move.
- Stacked parts used to make wind resistance negative, leaving the road free and
  contact losses tiny. Effects were trimmed so no build reaches an engine bound;
  a test checks all 16 fork combinations.

## Limits

The reference drivers are models, not playtests. They bound the balance and catch
regressions, but human players will value boost, drifting and slipstreams
differently: the reference humans steer out of wakes and never drift, so the
wind-tunnel body's slipstream and the drift parts are measured on the AI. The
measured seconds are clear-road averages (packs for the wind-tunnel body); traffic
changes them. Watch real runs before large retuning. Parts are local progress in
`localStorage` (`sora-cars:garage:v1`), not NFTs, and are not tradeable.
