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
| `traction` | Low-speed pull: below 160 km/h the rear tyres' grip for pulling the car forward stretches by the field's share (traction / 120), a friction ellipse that leaves their cornering grip as it was. Below about 170 km/h the stock car is held by its rear tyres, not its engine, so on the real roads this is the acceleration that counts out of every corner. |
| `cornerLoad`, `dryDamping` | Tyre grip, 2% per point: cornering, braking and the launch alike. |
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
  read from the native environment over a stock car's race on the real road.
  Hakone has rain for 25% of the race and a light crosswind, Yokohama 55% and a
  strong one, Nikko 25% and a gusty one.
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
| Hakone | Yui | Sport tyres → roll cage → coilovers → bumpers → steel armour → rally setup |
| Yokohama | Daichi | Roll cage → tyres → intake → boost controller → coilovers → bumpers → armour → rally |
| Nikko | Jun | Boost controller → intake → roll cage → tyres → intercooler → cams → coilovers |

On the current report Yui's sport tyres podium 91% of the time on Hakone's first
night (nothing 18%, roll cage 33%, intake 15%, boost controller 16%), and
Daichi's roll cage and intake 98% on Yokohama's (nothing 96%).

Since the Arcade courses moved onto their real roads (November 2026) the plans
follow what each road rewards. Hakone's bends are taken at the tyres' limit, and
below about 170 km/h the stock car is held by its rear tyres, not its engine, so
grip and low-speed pull are the time there. On Nikkō's long straight the car
runs flat out for 60% of the race, so boost and top speed are. All three plans
buy the cheap grip and body parts early, save for the rally setup, and take the
recovery option of every fork (torque six, rally setup, steel armour): the
story's drivers are rookies and regulars, who scrape the rails and lose speed,
and those options save them the most. Casual shoppers end up with the other
options, because they buy them first: cheapest-first fits the high-rev six and
the touge setup, priciest-first those and the lightweight body. That
is what separates a regular on the crew's picks, who beats Rei in Act 3, from a
casual one, who does not: by Act 3 every habit owns the parts that pay.

On the earlier level circuits the plans bought intake and boost first, because
a harbor pack rewarded top speed and the tyres' launch traction ran a rookie
into the car ahead at the start (see this file's history).

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
| エンジン ENGINE (Aki) | Intake & exhaust ¥7k | Cams & ported head ¥15k | High-rev six ¥18k / Torque six ¥56k | Full-tune six ¥66k (+ Intercooler) |
| ターボ TURBO (Jun) | Boost controller ¥7k | Intercooler ¥9k | Big turbine ¥25k / Twin turbo ¥25k | Anti-lag ¥70k (+ Cams) |
| 足回り CHASSIS (Daichi) | Sport tyres ¥12k | Coilovers ¥22k | Touge setup ¥32k / Rally setup ¥56k | Mechanical LSD ¥95k (+ Boost controller) |
| ボディ BODY (Yui) | Roll cage ¥5k | Reinforced bumpers ¥8k | Lightweight ¥28k / Steel armor ¥25k | Wind-tunnel body ¥75k (+ Coilovers) |

One full path costs ¥491k–556k; every part costs ¥656k. Effects are in
`TECH_NODES` (`src/game/garage-tech.ts`), and each part carries a `bestFor` tag
that the page shows beside its measured seconds a race ("FOR DRIFTERS"). The
balance tests hold each tag to its promise. Prices follow what each part is
worth on the real roads, tier by tier: grip costs the most, because it pays on
every bend, and boost the least, because it only pays where the car runs flat
out.

Four garage-only mechanics are zero at stock, so RaceV1 never sees them:

- **Drift charge** (Touge, LSD): holding a drift through a bend while steering
  *into* it at speed refills the turbo, more in tighter bends. Steering out of
  the bend charges nothing, so wiggling the wheel does not pay. Ace drivers with
  these parts drift through every bend.
- **Slipstream** (Wind-tunnel body): the speed cap rises in another car's wake,
  5–26 m behind and within 1.6 m.
- **Anti-lag**: extra push while boosting, so short bursts reach boost speed
  sooner.
- **Traction** (Torque six, full-tune six, tyres, rally, LSD, cage, bumpers,
  armour): low-speed pull below 160 km/h, out of every corner, without costing
  cornering grip.

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

- New garages start with ¥12,000, enough for the sport tyres Yui picks for Hakone.
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
| Club night | Stock | Club, two of the seven pro |
| Touge battle | ¥24k–96k | Club and pro |
| Championship | ¥68k–272k | Pro |
| Legends | ¥82k–328k | Pro and ace |

Rival builds spread from 40% to 160% of the field's budget through the grid, so
mid-pack finishes are common and a podium needs a build near the field's median.
Builds follow three purchase orders (power, boost, tough) through the same tree
and prerequisites as yours; each buys its own branch first and the tyres and
suspension before the capstones. On the driving model the rivals are `DriveAI`
drivers (`src/game/drive/ai.ts`). On the real roads how close to the tyres'
limit they corner separates them first (club drivers 87% of it, pros 92%, aces
95%), and how they use the boost on the fast stretches second:

- **Club** drivers, your crew and most club-night regulars, never fire the boost.
- **Pro** drivers wait for 85% of a tank and hold the burst; **ace** drivers wait
  for 95%. Both boost past a car once their path is clear.
- **Ace** drivers with drift charge drift through a bend only where their front
  tyres alone could hold it.

Story rivals use `STORY_REI` / `STORY_TORU`: Rei from chapter ID 2 (boost build,
pro driver) and Toru from ID 3 (power build, club driver). Since every chapter
opens with the pre-race garage, the budgets assume a player who upgrades. Rei
contests the lead through Act 3 with ¥140k, ¥140k, ¥220k and ¥220k (IDs 8–11;
her cars are worth ¥128k–212k). A regular on the crew's picks beats the faster
of Rei and Toru on the first try by 0.3 s on average; regulars who buy the
cheapest or the priciest part first lose by 1.6 s and 1.3 s, and a rookie on the
picks by 2.5 s. Her ¥220k car has the rally setup, which wins Hakone by itself:
at ¥220k there (ID 9) she beat the picks by 7 s. Toru's showdown (ID 10) build is
¥60k with the pro driver, which needs parts.

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

On the real roads a rookie is 3–7% slower than a pro on a clear road, a
regular up to 5% (within 1% of a pro in Yokohama and at Nikkō) and a club
driver 3–4%. Each part is measured along its
unlock path on all three tracks: on a clear road (40 rookie seeds, 12 regular
seeds, one run per AI driver), or, for the pack-racing wind-tunnel body, from
every grid slot of a club night. Gains are interquartile means of paired runs,
so one spin or wreck does not swamp the rest. A driving-model race costs a few
hundred milliseconds, so the measurement runs on every core and writes a report
that the tests check (about 25,000 races; 25–70 minutes on 15–20 workers,
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
  its tag names. `RACE_GAINS`, the seconds the cards show, match the report; a
  course where a part measures a loss of a tenth or less reads 0.0 (the
  anti-lag at Hakone, −0.075 s), and `tests/part-effects.test.ts` fails any
  bigger loss.
- Each tier is a worse deal than the one before, so the capstone is the costliest
  gain in every branch. Value per yen differs by at most 3× within a tier.
- Every fork is a real choice: each option saves its own tag's drivers more time
  per yen than the other. The high-rev six is top speed (+96, about 7 km/h)
  with less engine braking and a harder rail scrape; the torque six is
  low-speed pull. The high-rev six saves pros and aces 18 ticks a race for
  ¥18k against the torque six's 49 for ¥56k; rookies and regulars, who scrape
  the rails, get 56 ticks from the torque six and 6 from the high-rev. The
  touge setup is tarmac and rain grip with drift charge, the rally setup rail
  friction, traction and grip: touge saves an ace 1.73 ticks per ¥1k against
  rally's 1.44, and rally saves recovery drivers 1.87 against touge's 1.42.
  Lightweight (accel and a point of grip) beats Armour for clean drivers (1.34
  ticks per ¥1k against 0.44); Armour, cheaper, is the better buy for recovery
  (1.58 against 0.92) and takes at most 70% of the damage per hit. Big and Twin turbines each win on some track or for some
  driver.
- A finished car is 8–16% faster than stock (9.4–11.3% on Hakone, 13.8–14.0% in
  Yokohama, 14.7–15.1% at Nikkō).
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
  every time (74 of 96), but ¥60k always does. Touge and Championship never
  podium a stock car and ¥120k respectively and always podium ¥420k; Legends
  never podiums ¥180k, and a finished car podiums at least two times in three
  (85 of 96). On the real roads a ¥300k car has every part that pays, so
  Championship's rivals are built from ¥170k (¥68k–272k) and Legends' from
  ¥205k (¥82k–328k). Built from ¥160k with the quicker steering (13 November
  2026), Championship let a ¥120k car podium 3 times in 96 and Legends a ¥180k
  car 11 times, and Legends from ¥190k 3 times; in October, built from ¥180k,
  Championship's beat a ¥420k car 6 times in 96, and built from ¥400k, Legends'
  never let a finished car podium. Two of
  club night's seven regulars drive as pros: with seven crew drivers a stock
  pro podiumed it 94 times in 96.
- With equal cars a regular clears every story chapter at least half the time
  (Hakone 11 times in 12, Yokohama and Nikkō every time). Against the
  tuned rivals a stock regular still wins through the harbor chapters IDs 4 and 7
  more often than not.
- On the story's opening night on Hakone (96 seeds), a rookie with Yui's sport
  tyres (¥12k, the whole starting purse) podiums 85% of the time: four times as
  often as in a stock car (20%), and more than three times as often as when the
  same ¥12k goes cheapest-first on the roll cage and the intake (25%). The
  report keeps every seed's result, and the test holds the picks at least 20
  points above stock and 10 above cheapest-first, with the seed-by-seed gain
  above zero at a one-sided 95% bound (0.52 measured: the picks win 59 seeds
  that cheapest-first loses, the reverse 1). ¥29k of engine and boost parts does
  worse than the cage and intake (14%): Hakone's bends reward grip, not power. Until the real roads
  this check ran on the first harbor night, which a stock rookie now clears
  every time.

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
  runs; every run, at the showdown) and takes more than one and a half times the
  races of following the picks.
- Casual buying (cheapest or priciest first) stalls at most one campaign in
  64 per habit and driver. A habit that walls off 5% of players fails that 84%
  of the time (56% for none in 16), and one that walls off 1% passes it 86% of
  the time (85%). The crew's picks must never stall.
- In Act 3, a regular on the crew's picks beats the faster of Rei and Toru on the
  first try by under two seconds on average (0.3 s); casual builds (−1.6 s and
  −1.3 s) and rookies (−2.5 s) lose that first race to her.

| Garage habit (64 runs each) | Races to finish the story | Act 3 lead over the faster rival |
| --- | --- | --- |
| Crew's picks: rookie / regular | 12.3 / 12.0 | −2.5 s / 0.3 s |
| Cheapest first: rookie / regular | 15.1 / 12.0 | −5.3 s / −1.6 s |
| Priciest first: rookie / regular | 12.9 / 12.0 | −5.2 s / −1.3 s |
| Never buys: rookie / regular | 70.5, stalls on Hakone and at the showdown / 28.0, stalls at the showdown | −15.3 s / −9.5 s |

No casual habit stalls. On the real roads the pre-race garage is a big lever:
a rookie who follows the crew clears every chapter at the first or second try,
one who never buys stalls on Hakone's later nights and at the showdown.

### Findings that shaped the tree

With the stable pedals (13 November 2026, [driving-model.md](driving-model.md)):

- **The pedals cost the AI drivers more than the keyboard players.** Traction
  control and ABS now leave the tyres their cornering grip, so a driver who
  brakes into a bend can no longer slide through it on the rear tyres, and the
  AI's planner brakes for it sooner. At their earlier skill levels a lone club
  driver lost 3.8 s at Hakone, a pro 2.7 s and an ace 1.3 s, while the reference
  rookie lost 1.3 s and the regular 0.5 s; and in a car that no longer spun when
  bumped, a rookie shoved past club drivers through traffic. A stock rookie
  podiumed the opening night 98 times in 100 (26 before), a regular on the picks
  led Rei by 2.7 s in Act 3, and casual regulars beat her. The skill levels were
  raised to restore each level's Hakone pace (club 0.82 → 0.87 of the tyres'
  limit, pro 0.88 → 0.92, ace 0.93 → 0.95), which brought the opening night
  (34%) and Act 3 (0.7 s) back to where they were designed.
- **The quicker steering moved it again.** On 13 November the wheel was made to
  straighten in a twentieth of a second when the key comes up
  ([driving-model.md](driving-model.md)). New players who steer by what they see
  hit the rails far less and gained up to 8 s a race, but the reference rookie
  and regular lost 1.5 and 2.0 s at Hakone: they choose a key by predicting the
  wheel a tenth of a second ahead, and a wheel that drops straight when the key
  comes up no longer holds the in-between angles they steered with. The AI
  drivers lost 0.5 s. A stock rookie now podiums the opening night 20% of the
  time (85% on Yui's tyres), and a regular on the picks trailed Rei by 0.05 s in
  Act 3, so her first two Act 3 cars went from ¥160k to ¥140k (no lightweight
  body); he now leads by 0.3 s. Championship and Legends rivals went from ¥160k
  to ¥170k and ¥205k, where probe races put the ladder back before the
  re-measurement.
- **Five prices moved with what the parts are now worth.** The sport tyres pay
  a little more and the boost controller a little less, so tier I spread to
  2.99×; the controller went from ¥8k to ¥7k. With faster AI drivers the torque
  six's pull out of Hakone's bends saved pros more per yen than the high-rev
  six's top speed, so the high-rev six went from ¥28k to ¥22k after the pedals
  and to ¥18k after the steering (0.98 ticks per ¥1k against the torque six's
  0.87). Steel armour had become a better deal than the bumpers before it
  (¥21k → ¥25k), and the rally setup and then the cheaper high-rev six spread
  tier III past 3× (rally ¥50k → ¥56k, big turbine ¥27k → ¥25k; now 2.76×).
- **The cards' range.** The rally setup saves rookies and regulars 5.5 s at
  Hakone, past the cards' old 5 s ceiling, set when races lasted 74–103 s; on
  the real roads it is 8 s.

On the real roads (November 2026, after the courses took their real bends):

- **The car is held by its tyres below about 170 km/h.** 720 kW against the
  rear tyres' grip: until about 170 km/h traction, not power, limits
  acceleration. On Hakone, where a pro spends nine tenths of the race under
  200 km/h, 4% more grip saves about 3 s a race and 4% more top speed nothing;
  at Nikkō, flat out for 60% of the race, the same top speed saves 1.6 s and
  the grip 0.8 s. On the old tree the sport tyres (¥6k) were worth 13 times the
  intake per yen, its engine and boost parts barely moved a Hakone time, and a
  rookie on the crew's picks (intake first) needed nine tries at the first
  Hakone night.
- **Launch traction cost cornering grip.** It raised traction control's limit,
  so beyond about 8% the rear tyres had nothing left for cornering under power:
  AI cars slid out of Hakone's bends and lost 0.6–1.5 s a race with 8% more
  traction. It is now a friction ellipse ([driving-model.md](driving-model.md));
  8% more saves about 1 s a race for every driver.
- **Drifting the limit bends lost time.** An ace with drift charge drifted every
  bend tighter than a kilometre and lost about 1 s at Hakone, because under power
  the sliding tail holds almost nothing. Aces now drift only where their front
  tyres alone could hold the bend, and the drift parts carry real grip: the
  touge setup tarmac and rain grip, the LSD traction.
- **Prices follow what the parts are worth there.** Each part was re-measured
  on the real roads and priced so every tier stays within 3× across branches and
  no better a deal than the tier before. Grip and the recovery options got dearer
  (tyres ¥6k → ¥12k, rally ¥18k → ¥50k, armour ¥8k → ¥21k), boost cheaper
  (controller ¥12k → ¥8k, big turbine ¥56k → ¥27k).
- **Capstones had to matter.** With the value in the cheap parts, a ¥300k car
  came within 0.3% of a finished one on Hakone and 2% elsewhere, and no Legends
  field fit between ¥180k and a finished car (with rivals from ¥400k a finished
  car never podiumed). The capstones now
  carry real gains: the full-tune six's pull and lighter engine braking, the
  LSD's traction and the wind-tunnel body's downforce.
- **The finished car's Nikkō gain is boost.** Trimming top speed barely moved
  it; easing the intercooler's refill and the anti-lag's kick took an ace's from
  15.8% to 14.7%.
- **By Act 3 every shopping habit owns the parts that pay.** What separates the
  crew's picks from casual shopping is the fork options (above). With the
  story's purses unchanged, a regular on the picks and a casual one are 1–2 s a
  race apart in Act 3, and Rei's budgets sit between them.

On the level circuits (October–November 2026):

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
  tyres, but from about +10% of traction stacking traction parts stopped
  paying. (On the real roads this turned out to be the rear tyres running out of
  cornering grip, not the engine; see above.)
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
