# Driving model

Local practice and story races, on the Arcade circuits and the 1986 street
routes, run on a rigid-body car model in `src/game/drive/`. Live and staked
races keep the native RaceV1 relation, because consensus, proofs and
settlement are built on it. `?physics=native` restores the earlier local
arithmetic (RaceV1 for the Arcade, the native street draft graph for the
street routes) for comparison. Old RaceV1, garage and street v1 replays still
play on the model they were recorded with.

## Why

The earlier local models moved cars along the road with fixed speed losses:
a tree cost 600 mm/tick, a car contact removed the colliding velocity
components outright, and the street draft stopped a car's travel on a square
wall hit. Contact therefore felt like hitting glue. The driving model instead
carries momentum through every contact and lets damage, not an arbitrary
speed penalty, decide the cost of a crash.

## The car

One AE86-sized rear-drive coupe: 1,050 kg, 2.40 m wheelbase with 56% of the
weight on the front axle, 1,750 kg·m² yaw inertia and a 3.9 × 1.6 m collision
box, slightly inside the drawn body. Garage parts keep their meaning:
`vehicleSpec` turns each RaceV1-scaled tune field into a physical property
(acceleration into engine power, top speed into the rev limiter, boost top
speed into the boost limiter and boost power, corner load into tyre grip,
off-road loss into rail friction, contact and impact losses into toughness,
and so on; [garage-tech-tree.md](garage-tech-tree.md) has the table). The
stock tune gives exactly the stock car.

- **Tyres.** Each axle follows a combined-slip Pacejka curve (B 11, C 1.4):
  peak grip near 9° of slip and about 80% of it when sliding, shared with
  drive and braking forces in a friction circle. Normal loads include
  downforce and front-to-back load transfer, so braking loads the nose and
  power loads the tail. Rain, oil under each axle and the verge reduce grip.
  The grip level is deliberately sporty (μ 2.35 plus downforce) so the street
  races stay near their soundtracks.
- **Engine and brakes.** A power-limited rear drive with traction control
  (off while drifting), a rev limiter at the tune's top speed, a boost that
  adds power and raises the limiter, engine braking off the throttle, and
  front-biased brakes with ABS. Traction control and ABS give the pedals only
  the grip that cornering is not using (see "Pedals in a bend" below). The
  garage's launch traction stretches the rear tyres' grip for pulling the car
  forward below 160 km/h, as a friction ellipse: traction control keeps the
  same share of the longer reach, so the extra pull leaves cornering grip as it
  was. (When it raised traction control's limit instead, past about 8% the rear
  tyres had no grip left for cornering under power, and AI cars slid out of
  Hakone's bends: more traction made them slower.) Holding
  the brake at a standstill selects reverse, so a spun car can back out.
- **Steering.** The held key asks for a path curvature: at speed, the tyres'
  cornering limit, so full lock corners as hard as the car can. Keys are all
  or nothing, so how fast the wheel winds on is the keyboard's sensitivity: a
  third of a second to full lock at town speeds, about 0.6 s at 100 km/h and
  1.1 s at 250 km/h. Released, it is straight again in a twentieth of a second,
  so the car stops turning when the key comes up. A tap is a small correction
  and only a held key corners at the limit: on a straight at 120 km/h a 0.1 s
  tap turns the car half a degree, 0.3 s about 4.5° and 0.5 s 13°; at 250 km/h
  0.3°, 2.2° and 5.6°; a second held at 50 km/h turns it about 90°. When the
  wheel wound on in a fifth of a second, a 0.3 s press at 120 km/h turned the
  car 12° at nearly 4 g. Turning into a bend, the wheel winds on quickly to half
  again as far as the road itself turns over the next half second, and a tenth
  further (`roadWheel`), then slowly again; turning against the bend, it stays
  slow. With the slow wheel alone it reached a fast bend after the bend
  did: the garage's keyboard reference drivers ran wide into the rails at
  Tokyo's 160–200 km/h bends (twice the damage) and lost a second a race on
  the Harbor Run. Naive simulated keyboard players (0.2–0.27 s reactions,
  presses of at least 0.1 s, four styles, 24 races each) hit the rails 390–700
  times where they hit them 640–800 times with the quick wheel, slide for
  280–380 s where they slid for 790–1,020 s, and no longer retire (5–9 times
  each). The front wheels point where the front axle travels on that path,
  which is the body's sideslip plus the turn, and then a little further: the
  slip angle the front tyres need to carry their share of the corner on the
  current surface. Without that slip angle, full lock reached only a quarter of
  the car's grip at 250 km/h and every fast bend ran wide. Following the
  sideslip countersteers a slide automatically. The yaw-rate part of the front
  tyre's slip stays untouched, which keeps its natural damping.
- **Drift.** Holding drift lets the rear tyres go over a quarter of a second
  (to 60% of their grip, less with the garage's drift parts). The car then
  settles into a slide of 30–40° at full lock, scaled by how far the
  steering is turned, whatever the speed. On the throttle it turns a little
  tighter than a gripping car at 60–90 km/h and charges boost with the
  drift-charge parts, on any bend tighter than a kilometre's radius and more in
  tighter ones. Releasing the button lets the tyres bite again over the
  same quarter second, and the car straightens without whipping back the
  other way. Off the throttle a drift also drags the rear brakes.
- **Stability control.** Outside a drift, a capped yaw moment keeps yaw near
  the steering's request and sideslip small; a hard hit still spins the car.
  In a drift, and while the car gathers itself after one, it instead holds
  the slide the steering asks for and damps its swing.

**Pedals in a bend.** The cornering the car is doing (its speed times its yaw
rate) takes grip from each axle in proportion to the weight it carries.
Traction control gives the engine 92% of what is left of the rear tyres'
friction circle, and ABS gives the brakes 85% of what is left of the fronts'
and 70% of the rears', never less than 15% (power) or 25% (brakes) of an
axle's grip, so a car past the limit can still slow down. Cornering brake
control then caps the total: braking moves load off the rear axle, which is
holding the tail in the bend, so the brakes work only as hard as leaves the
rear tyres the load that cornering needs (at least 3 m/s²; a car already
sideways brakes with everything). In a straight line nothing changes.

Until 2026-11-13 the shares were fixed: 92% of the rear tyres for power and
85% of the fronts for braking, whatever the car was doing. Full throttle then
left the rear tyres 39% of their cornering grip, and the brake in a bend spun
the car. With an ace AI steering a 40 m bend at 90 km/h, 1.2 s of brake swung
the car 92° sideways; it now slows to 43 km/h within 0.2 m of its line and 7°
of sideslip. A lone ace AI slid (more than 4 m/s sideways) for 41 s of a
164 s race at Hakone, touched the rails 63 times and ran 2.9 m off its line
on average; it now slides for 1 s, touches them 21 times and stays within
1 m, and a club driver's 14 s of sliding and 22 touches became 0.1 s and 4.
The AI drivers paid for it in pace: they could no longer brake late into a bend
and slide through it, and their planner now brakes for it sooner (below). At
their earlier skill levels a lone club driver lost 3.8 s at Hakone (170.7 to
174.5 s), a pro 2.7 s and an ace 1.3 s, and up to 1.1 s on the faster courses,
while the keyboard reference drivers lost at most 1.3 s and, in a car that no
longer spun when bumped, shoved past them through traffic: a stock rookie
podiumed the story's opening night 98 times in 100, where it had 26 times. The
skill levels were raised to restore each level's Hakone pace (`DRIVER_SKILLS`:
club 0.87, pro 0.92 and ace 0.95 of the tyres' cornering limit, from 0.82,
0.88 and 0.93), which leaves a stock rookie 29% of opening-night podiums.

Integration runs four 120 Hz substeps per 30 Hz tick in road (Frenet)
coordinates: progress, lateral offset and heading relative to the road, using
the same stations the 3D world draws, so cars appear exactly where they are.

**Hills.** Gravity acts along the road's grade. The street routes take it from
their compiled heights; the Arcade courses from the real roads they are set on
(`src/game/arcade-geography.ts`; Midnight Circuit climbs 320 m up Route 1 at up
to 9%, Sakura Pass 175 m). Live races keep RaceV1, which has no heights.

**Real bends.** Since 2026-11-11 a local Arcade race runs on its real road's
plan: one stretch of road (`topology: 'sprint'`) from 100 m before the start
line to the end of the run-off, with a heading every 5 m (Hakone turns 4,416°,
down to a 15 m radius at the Ōhiradai hairpin). Its three laps are distances
along it, its grid stands behind the line on the lead-in, and it may run five
minutes (`ARCADE_REAL_MAX_TICKS`): eight stock cars take 2:44–2:56 at Hakone,
2:26–2:36 in Yokohama and 1:23–1:29 at Nikkō, against 1:14–1:43 on RaceV1's
bends. RaceV1's weather schedule carries on past its 5,400 ticks
(`arcadeEnvironmentAt`). The 3D world draws the course the race runs on
(`courseDrawing`): each 5 m interval of the model is an arc of constant
curvature, split for drawing wherever it turns more than 2°. RaceV1, whose
bends Iroha's native rules and proofs mirror, keeps its own until those move
to the real roads too. Nothing has launched, so earlier Arcade replays were
not kept compatible: every local Arcade race and replay runs the real road.

## The player drives

The keys reach the car as they are: nothing steers, brakes or picks a line for
the player. On 2026-11-13 a co-driver briefly sat between the keys and the car,
braking for the bends, holding the car on a lane and turning the steering keys
into moves across the road; the user rejected it ("it should be the user
driving") and it was removed the same day. What makes the car manageable is the
car itself: the pedals above leave the tyres their cornering grip, and the
steering winds on gently at speed and quickly into a bend as far as the road
turns.

Why it is still hard work: keys are all or nothing, and a held key turns the
car until the driver steers it back by the same amount. On 2026-11-12 the user
said the handling was "too hard… the car just feels out of control and crashing
everywhere". In eight-car races at Hakone the garage's reference keyboard
drivers, who brake for every bend to within 5%, then touched the rails 170–190
times a race (28–43 times above 6 m/s); a driver who misjudged bends by 30%
wrecked two races in three. With the new pedals they touch them 160–190 times,
about 40% fewer of them above 6 m/s, with a third less damage, and the driver
who misjudged bends by 30% finished all three races; held for half a second at
100 km/h a key still swings the nose 19°.

Where they hit the rails: in a bend, having turned in late. At the moment of
contact the key had been held toward the bend for 0.4–0.5 s and the wheel was at
0.85 of full lock, nearly twice what the bend needed, with the car still
pointing 10° toward the outside; only 4–15 contacts a race came from arriving
too fast for the bend. Then, coming off the outside rail with the wheel still
turned, the car crossed the road to the other rail. A glancing rail contact
itself leaves the car running parallel to the rail. So on 2026-11-13 the wheel
was made to straighten in a twentieth of a second instead of a sixth when the
key comes up, and to wind on quickly into a bend to half again as far as the
road turns, plus a tenth, instead of exactly as far. Keyboard drivers who steer
by what they see, without knowing how the wheel winds on (bang-bang keys, a
0.2 s or 0.27 s reaction; four races each on the old steering and six on the
new, on Hakone and Yokohama, counted per kilometre):

| Driver | Rail contacts | Crossings to the other rail | Hard hits | Damage |
| --- | --- | --- | --- | --- |
| New player, Hakone | 11.5 → 8.8 | 5.4 → 2.1 | 6.4 → 2.3 | 5.7 → 1.9 |
| Slow new player, Hakone | 19.9 → 10.8 | 12.0 → 3.8 | 15.2 → 5.5 | 36.4 → 9.4 |
| New player, Yokohama | 7.4 → 3.5 | 4.0 → 0.9 | 3.2 → 1.0 | 3.5 → 0.6 |
| Slow new player, Yokohama | 15.7 → 5.9 | 11.9 → 2.6 | 11.2 → 2.3 | 18.4 → 2.8 |

The slow new player wrecked in every race before and now finishes all six at
Yokohama and four of six at Hakone; the new player finishes 8–14 s sooner. The reference
rookie and regular, who already steer knowing how the wheel winds on, barely
change. A single press turns the car slightly less than before, because the
wheel no longer keeps turning it while it straightens. Unwinding more slowly
than a sixth of a second made all of them weave; the faster the wheel came
straight, the better every driver did. The AI drivers lose about 0.5 s a race.

## Contact

Walls are the guard rails' faces. Each corner and the middle of each side is
tested against both rails; cars are separating-axis boxes; breakaway signs
and potted saplings are light bodies on mountings that snap. Every contact
resolves an impulse at the actual contact point with restitution and Coulomb
friction:

| Contact | Restitution | Friction | Notes |
| --- | --- | --- | --- |
| Rail | 0.22 | 0.26 | Scraping wears the side panels in proportion to how hard the car leans on the rail |
| Car | 0.28 | 0.38 | Both cars exchange momentum and spin |
| Sign / sapling | 0.15 | — | 45 / 180 kg; the mounting absorbs 300 / 2,200 N·s and the prop flies off |

A rear-end shunt shoves the car ahead and slows the one behind; a glancing
rail hit deflects the car and costs a little speed; a square hit at speed is a
crash. Oil zones and breakaway props come from each route's catalog; Arcade
trees stand behind the rails.

## Damage

Damage comes from each impact's delta-v, the measure crash investigators use:
nothing below 6 m/s (22 km/h), then `0.5 x + 0.16 x²` points for the excess
`x`, times the car's toughness. A 10 m/s knock costs about 5 points, a 20 m/s
crash 38 and a 30 m/s one more than the car can take. A guardrail counts only
from 8 m/s (29 km/h, `RAIL_DAMAGE_FROM`): it steers a glancing car, and on the
Arcade courses' real roads a keyboard rookie brushes it some thirty times a
race, which at 6 m/s wrecked half the reference rookies' tuned cars at Hakone. Points are shared between
the front, rear, left and right zones by where the contact landed. A crushed
nose costs engine power, side damage costs grip, rear damage costs traction,
torn bodywork adds drag, and uneven side damage pulls the steering.

Brushing a wall is free because keyboard players brush them all the time. The
garage's keyboard reference drivers, braking for the street routes' bends but
misreading them by 7–15%, touch a wall 40–300 times a race. With the earlier
3 m/s threshold and `0.9 x + 0.12 x²` those touches wrecked the regular driver
in 7 street races of 10 and the rookie in 9. Now, over 15 races each (three on
every route), the regular driver finishes them all with about a fifth of the
limit used and two panels gone, and the rookie finishes all 15 (95 of 100 over
twenty seeds) with about half used and six panels gone (`scripts/drive-check.ts`
with `PLAYER`).

Twelve panels break away at fixed zone thresholds (`CAR_PARTS` in
`damage.ts`): number plates, bumpers, pop-up headlights, bonnet, boot lid,
mirrors and doors. At 100 points (`DAMAGE_LIMIT`) the car is **wrecked**: the
engine dies, the car slides to a stop, smokes and burns, stays solid for three
seconds and is then towed. A wrecked car is out of the race (大破 / WRECKED).
When the player is wrecked, the rest of the field races on and the results
follow. A head-on hit at about 30 m/s wrecks a car outright; light contact and
glancing rail hits only scuff it.

## Marshals

A car that gains no ground for five seconds (`RECOVERY_TICKS`) is set back on
the road by the marshals. That covers a car pinned against a rail or a wreck,
spun round, or driving the wrong way. The start allows five seconds more, so a
slow getaway is left alone. The marshals put the car down at rest, pointing up
the road, at the furthest point it reached and as near its own line as the
traffic allows; with no gap, they wait a tick. The HUD warns 逆走 / WRONG WAY
while the player's car points more than 100° off the road's direction. After
two seconds without progress it shows 立ち往生 / STUCK, counting down to the
marshals.

## Presentation

`crash-effects.ts` draws sparks at rail and car contacts, smoke from damaged
engines, fire on wrecks and the broken panels and props tumbling down the
road. The detailed AE86 template sorts each body surface's triangles by panel
at load time, so a car with missing panels draws the remaining runs of the
same shared index as geometry groups, with no per-car GPU buffers. The HUD
shows a top-down damage diagram and a bar to the wreck limit. A hit above
9 m/s of delta-v (or a planter) plays the heavy crash sound, lighter knocks the
metallic one. Both are existing voices: the released soundtrack pins the bytes
of `audio.ts`, so a change there needs the re-qualification recorded in
`soundtrack-verification.md`.

## Replays and determinism

Fixed steps, fixed order and only exact IEEE operations: `dmath.ts` provides
polynomial sine, cosine and arctangent instead of the engine-dependent
`Math` functions, so a replay re-executes bit-identically on any browser.
Arcade replays carry `rules: 'SoraDriveV1'` with every car's tune and every
tick's controls; they always run the real road. Street replays are version 2
(`sora-cars.local-street-drive.v2`) and are verified by full re-execution
against their recorded outcome; seeking restores one-second snapshots.

## Pace and limits

`npm run check:drive [-- route…]` races eight AI drivers on every
course. It prints finishing times, contacts, wrecks, marshal recoveries and
stalls. `PLAYER=rookie` or `PLAYER=regular` (with `SEED=n`) puts one of the
garage's keyboard reference drivers in slot 3 instead and prints its place,
damage, lost panels and wall touches. It brakes for the bends it sees,
overrating their speed by 5% (rookie) or 3% (regular), reading them by the
HUD's corner cue; at the street routes' first tuning (15% and 7%) every
rookie wrecked on Hakone's real road within 5 km, and a regular in Act 3's
tuned car on every try. In the last run every car finished every course with no wreck,
recovery or stall. A lone AI car stays within about 0.5 m of its racing line
on average and finishes an Arcade race with almost no rail contact. On the Arcade
courses' real roads the club drivers, who never boost, are the slowest by 1–4 s. Tokyo (255–271 s
against its 255 s song) and Aizu (148–159 s, 161 s song) finish close to the
end of their songs; Kyoto (222–238 s, 209 s song) and Nara (190–204 s, 179 s
song) run 6–14% long. Irohazaka (239–255 s against its
187 s song) is slower than the earlier draft model, whose 3 g acceleration and
9 g braking made its twenty hairpins nearly free. Even near-perfect AI drivers
need about 236 s there. While the player races, a street song that ends plays
again from the top; once their race is over (the line, a wreck or the time
limit), it finishes its four-bar phrase and plays its own final eight bars once,
over the rest of the field and the results (`streetSongPosition` in
`src/game/street/soundtrack-clock.ts`). The tick, the race end and the time on
the results screen fix the song's position, so replay seeks land on the same
note. The driving model gives street races 12,000 ticks (400 s) so slower
drivers can still finish.

The AI follows a minimum-curvature racing line at a grip-limited speed with
pure pursuit steering and the same control bits a player presses. Its speed
is the fastest from which it can still slow for every bend within braking
reach (`reachSpeed` in `ai.ts`): braking shares
the tyres' grip with cornering and leaves the rear axle its load, as the
car's own ABS does, so a driver slows for a tightening bend before it rather
than at full force in the middle of it. Each tick it
presses the key whose wheel position after the tick lands nearest the steering
pure pursuit asks for, predicting the wheel as the race moves it: quickly into
a bend (`roadWheel`). When it predicted the slow rate there, it picked the
wrong key one tick in twenty-two, touched the inside rail of bends 11% more
often, and a pro or ace starting seventh in the practice fields finished 0.4
places lower. The keyboard reference drivers predict the wheel the same way,
though their deadband means it rarely changes a key for them. The AI moves
off the line for traffic, and back, at 8 m/s: away from a bend the wheel winds
on slowly at speed, and a sudden swerve overshot into the rails (instant moves
doubled the AI's rail contact at Harbor Run), while at 5 m/s a quicker car
stayed boxed in behind the pack. On the Arcade
courses' real roads the bends set the pace. Below about 170 km/h the stock car
is held by its rear tyres, not its engine, so on Hakone, where a pro spends
nine tenths of the race under 200 km/h, grip decides the time and power or
boost barely move it; at Nikkō the car spends 60% of the race at its rev
limiter, and Yokohama is in between. A burst's extra speed coasts down slowly,
so long bursts gain far more than short ones: club drivers never fire it, pro
drivers wait for 85% of a tank and ace drivers for 95%. A driver boosts past a
car once its own path is clear. An ace whose build has drift charge drifts
through a bend only where its front tyres alone could hold it: under power the
sliding tail holds almost nothing, and drifting the bends taken at the limit
lost more time than the boost won back (an ace with the drift parts was 1 s
slower at Hakone). The AI has not been calibrated against measured human lap
times. The
garage balance, and the race time each part card shows (`RACE_GAINS`), are
measured on this model with the AI and with keyboard reference drivers that
steer late, lift and brake when they run wide and keep their own boost habits;
see [garage-tech-tree.md](garage-tech-tree.md).
