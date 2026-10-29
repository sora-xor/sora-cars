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
| Either, with **全車ノーマル / EQUAL CARS** on | Exact RaceV1 for everyone | The original stock practice and story grids |
| Live XOR races, spectating, Tokyo street run | Unchanged | Unchanged |

A race in which every car is stock runs on the native RaceV1 kernel and saves a
normal `RaceV1` replay. Any tuned car switches the race to
`src/game/tuned-engine.ts`, which is a parameterised copy of the RaceV1 step.
With `STOCK_TUNE` it reproduces the native circuit tick for tick, including
every tree, sign and oil contact (checked on all tracks and grid sizes by
`tests/garage-tech.test.ts`). Tuned races save a separate `SoraGarageV1` replay
that records every car's tune and the RaceV1 rules hash it was derived from. It
re-simulates exactly, and it is never accepted as a RaceV1 transcript.

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

Each course has a fixed purchase order, `COURSE_TIPS[track].plan`. Each step is
the part that saves rookie and regular drivers the most time per yen on that
course, re-measured after every purchase:

| Course | Crew | Opening of the plan |
| --- | --- | --- |
| Hakone | Yui | Boost controller → intake → tyres → intercooler → cams → big turbine → torque six |
| Yokohama | Daichi | Tyres → intake → coilovers → boost controller → intercooler → big turbine → cams |
| Nikko | Jun | Boost controller → intake → cams → intercooler → big turbine → torque six → tyres |

The pick skips a fork the player settled on the other option. Buying a fork
option fits it, so a player who bought both may race the wrong one. When the
plan's option is the stored one, the pick is to swap it back in, free.

## The tree

Four branches, each with two linear tiers, a tier III **setup fork** and a tier
IV capstone. You may own both fork options and swap them for free between races.
Every capstone needs a part from another branch.

| Branch (crew) | I | II | III (fork) | IV |
| --- | --- | --- | --- | --- |
| エンジン ENGINE (Aki) | Intake & exhaust ¥10k | Cams & ported head ¥24k | High-rev six ¥52k / Torque six ¥52k | Full-tune six ¥96k (+ Intercooler) |
| ターボ TURBO (Jun) | Boost controller ¥7k | Intercooler ¥20k | Big turbine ¥46k / Twin turbo ¥46k | Anti-lag ¥88k (+ Cams) |
| 足回り CHASSIS (Daichi) | Sport tyres ¥6k | Coilovers ¥16k | Touge setup ¥40k / Rally setup ¥28k | Mechanical LSD ¥80k (+ Boost controller) |
| ボディ BODY (Yui) | Roll cage ¥6k | Reinforced bumpers ¥10k | Lightweight ¥36k / Steel armor ¥42k | Wind-tunnel body ¥78k (+ Coilovers) |

One full path costs about ¥620k; every part costs ¥807k. Effects are in
`TECH_NODES` (`src/game/garage-tech.ts`), and each part carries a `bestFor` tag
that the page shows beside its measured seconds a race ("FOR DRIFTERS"). The
balance tests hold each tag to its promise.

Four garage-only mechanics are zero at stock, so RaceV1 never sees them:

- **Drift charge** (Touge, LSD): holding a drift while steering *into* a corner
  at speed refills the turbo, more in tighter corners. Steering out of the
  corner charges nothing, so wiggling the wheel does not pay.
- **Slipstream** (Wind-tunnel body): the speed cap rises in another car's wake,
  3.6–22 m behind and within one lane.
- **Anti-lag**: extra acceleration while boosting, so short bursts reach boost
  speed sooner.
- **Traction** (Torque six, tyres, bumpers, rally, armor): extra acceleration
  below 1,500 mm/tick for launches and recoveries.

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
  names, measured in simulation (`RACE_GAINS`, re-measured by the balance tests).
  The pre-race garage marks tonight's course, and the crew's pick quotes it.
- **On your car:** every change in race units, from your current car to the car
  with the part fitted (or without it, for a fitted part). That means km/h,
  seconds of boost, percent of stock, and speed lost per tree, sign or bump. A
  fork option also lists what the other option takes with it, so a swap shows
  its trade-offs.
- **The stat bars preview the part:** green where it gains, striped red where it
  costs.

## Parts in 3D

Every part spins in 3D: an icon on its card, a turntable in the detail panel
(drag it to spin), and the crew's pick in the pre-race garage. Buying or swapping
a part in flashes it, rings the deck, throws sparks and stamps 装着！ / FITTED!.

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
| Club night | Stock | The original practice AI |
| Touge battle | ¥24k–96k | Practice AI and pro |
| Championship | ¥72k–288k | Pro |
| Legends | ¥168k–672k | Pro and ace |

Rival builds spread from 40% to 160% of the field's budget through the grid, so
mid-pack finishes are common and a podium needs a build near the field's median.
Builds follow three purchase orders (power, boost, tough) through the same tree
and prerequisites as yours. Pro and ace drivers (`src/game/garage-ai.ts`) read
their own tune: they hold full boost bursts, prefer the oil-free centre lane,
slingshot out of slipstreams and, with drift charge, drift into corners. The
club driver is the unchanged practice AI.

Story rivals use `STORY_REI` / `STORY_TORU`: Rei from chapter 3 (boost build, pro
driver) and Toru from chapter 4 (power build, practice AI). Since every chapter
opens with the pre-race garage, the budgets assume a player who upgrades. Rei
reaches ¥210k by the finale and contests the lead through Act 3. Toru's
chapter 11 showdown build is ¥90k with the pro driver, which needs parts.

## How it was balanced

Every number comes from simulated races, using reference drivers in
`tests/helpers/garage-drivers.ts`:

- **Rookie** reacts late, ignores corner push and loses concentration.
- **Regular** reads corners a little and saves boost for straights.
- **Club**, **pro** and **ace** are the opponent AIs.

Seeds vary the rookie and regular drivers. Each part is measured along its
unlock path from four grid slots on all three tracks (`FULL_PLAN`). Re-run after
changing any effect, price, rival budget or physics:

```sh
npm run balance:garage
```

`tests/garage-balance.test.ts` enforces the resulting limits:

- Every part saves at least 4 ticks a race (tiers I–II) or 10 ticks (III–IV) for
  the drivers its tag names.
- Each tier is a worse deal than the one before, so the capstone is the costliest
  gain in every branch. Value per yen differs by at most 3× within a tier.
- Every fork is a real choice. High-rev beats Torque for clean drivers and loses
  for rookies and regulars. Touge beats Rally for drifters and loses for recovery.
  Lightweight beats Armor for clean drivers and loses for recovery. Big and Twin
  turbines each win on some track or for some driver.
- A finished car is 6–14% faster than stock, never more.
- The fields form a ladder. A stock car wins Club, but cannot podium in Touge.
  ¥120k podiums Touge. ¥420k podiums Championship. A finished car contends in
  Legends.
- A stock pro can still meet every story objective except Toru's showdown. On
  the windy Yokohama chapters 5 and 8, a modest build lifts regular drivers'
  clear rate by at least 40 points.

`tests/story-pit-balance.test.ts` plays the whole story the way story mode runs
it: pre-race garage, race, prize money, retry until cleared. It plays eight
seeded runs per driver, with four garage habits: the crew's picks, cheapest part
first, priciest part first, and never buying. It holds:

- Each course plan's first three picks are within 90% of the best time per yen
  on offer at that step, re-measured.
- On the crew's picks, rookies and regulars never stall. The first Yokohama
  chapter averages at most four races; every other chapter, under two.
- Never buying stalls rookies in the Yokohama chapters (at least four stalls in
  eight runs before the showdown) and takes more than twice the races of
  following the picks.
- Casual buying (cheapest or priciest first) never stalls anyone.
- In Act 3, a driver on the crew's picks beats the faster of Rei and Toru by
  under two seconds on average. Cheapest-first buyers are slower.

| Garage habit (8 runs each) | Races to finish the story | Act 3 lead over the faster rival |
| --- | --- | --- |
| Crew's picks: rookie / regular | 15.5 / 13.5 | 0.8 s / 0.7 s |
| Cheapest first: rookie / regular | 15.8 / 14.5 | −0.8 s / −1.0 s |
| Priciest first: rookie / regular | 15.5 / 13.5 | 0.0 s / −0.1 s |
| Never buys: rookie / regular | 43.6 / 29.8, stalls in Yokohama | −6.7 s / −5.4 s |

### Findings that shaped the tree

- **Top speed dominates RaceV1.** Each +1% saves about 1% of race time for every
  driver, so engine parts are the most expensive per point.
- **Boost value depends on burst length.** Speed snaps back to the normal cap when
  a boost ends, and the climb to boost speed takes 15 ticks, so long bursts are
  roughly 12× more efficient than taps. The practice AI stops at half a tank,
  which is why turbo parts barely help it and are tagged for boost users.
- **Handling barely matters to a clean driver.** It decides how often a mistake
  becomes an off-road disaster. Yokohama's crosswinds and rain are the original
  game's difficulty spike: regular drivers clear chapters 2, 5, 8 and 11 only
  8–17% of the time in equal cars. In chapter 2, ¥50k of tyres, coilovers and
  rally setup lifts rookies from 13% to 79% and regulars from 25% to 92%. ¥41k of
  engine and turbo parts reaches only 38% and 71%.
- **With the garage in the story's path, the old rival budgets made the late
  story a walkover.** On the crew's picks, rookies won every Act 3 race by about
  four seconds, and Toru's ¥35k showdown car was never close. Raising Rei's
  budgets keeps her within a couple of seconds. Raising Toru's showdown car past
  ¥90k began to stall casual builds, so it stops there.
- Stacked parts used to make wind resistance negative, leaving the road free and
  contact losses tiny. Effects were trimmed so no build reaches an engine bound;
  a test checks all 16 fork combinations.

## Limits

The reference drivers are models, not playtests. They bound the balance and catch
regressions, but human players will value boost, drifting and slipstreams
differently. Watch real runs before large retuning. Parts are local progress in
`localStorage` (`sora-cars:garage:v1`), not NFTs, and are not tradeable.
