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
  front-biased brakes with ABS that leaves the tyres able to steer. Holding
  the brake at a standstill selects reverse, so a spun car can back out.
- **Steering.** The held key asks for a path curvature: at speed, the tyres'
  cornering limit, so full lock corners as hard as the car can. Keys are all
  or nothing, so how fast the wheel winds on is the keyboard's sensitivity: a
  third of a second to full lock at town speeds, about 0.6 s at 100 km/h and
  1.1 s at 250 km/h. It always unwinds in a sixth of a second. A tap is a
  small correction and only a held key corners at the limit: on a straight at
  120 km/h a 0.1 s tap turns the car half a degree, 0.3 s about 4.5° and 0.5 s
  13°; at 250 km/h 0.2°, 1.7° and 5°; a second held at 50 km/h still turns it
  almost 90°. When the wheel wound on in a fifth of a second, a 0.3 s press at
  120 km/h turned the car 12° at nearly 4 g. Turning into a bend, the wheel
  still winds on that quickly as far as the road itself turns over the next
  half second (`roadWheel`), then slowly again; turning against the bend, it
  stays slow. With the slow wheel alone it reached a fast bend after the bend
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

Integration runs four 120 Hz substeps per 30 Hz tick in road (Frenet)
coordinates: progress, lateral offset and heading relative to the road, using
the same stations the 3D world draws, so cars appear exactly where they are.

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
crash 38 and a 30 m/s one more than the car can take. Points are shared between
the front, rear, left and right zones by where the contact landed. A crushed
nose costs engine power, side damage costs grip, rear damage costs traction,
torn bodywork adds drag, and uneven side damage pulls the steering.

Brushing a wall is free because keyboard players brush them all the time. The
garage's keyboard reference drivers, braking for the street routes' bends but
misreading them by 7–15%, touch a wall 40–300 times a race. With the earlier
3 m/s threshold and `0.9 x + 0.12 x²` those touches wrecked the regular driver
in 7 street races of 10 and the rookie in 9. Now, over 15 races each (three on
every route), the regular driver finishes them all with about a fifth of the
limit used and two panels gone, and the rookie finishes 14 with about half used
and six panels gone (`scripts/drive-check.ts` with `PLAYER`).

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
metallic one; `audio.ts` itself is unchanged, because the released soundtrack
pins its bytes.

## Replays and determinism

Fixed steps, fixed order and only exact IEEE operations: `dmath.ts` provides
polynomial sine, cosine and arctangent instead of the engine-dependent
`Math` functions, so a replay re-executes bit-identically on any browser.
Arcade replays carry `rules: 'SoraDriveV1'` with every car's tune and every
tick's controls. Street replays are version 2
(`sora-cars.local-street-drive.v2`) and are verified by full re-execution
against their recorded outcome; seeking restores one-second snapshots.

## Pace and limits

`npm run check:drive [-- route…]` races eight AI drivers on every
course. It prints finishing times, contacts, wrecks, marshal recoveries and
stalls. `PLAYER=rookie` or `PLAYER=regular` (with `SEED=n`) puts one of the
garage's keyboard reference drivers in slot 3 instead and prints its place,
damage, lost panels and wall touches; on the street routes it brakes for the
bends it sees, overrating their speed by 15% or 7%. In the last run every car finished every course with no wreck,
recovery or stall. A lone AI car stays within about 0.5 m of its racing line
on average and finishes an Arcade race with almost no rail contact. Arcade races
take 74–104 s, close to the earlier engine's 76–103 s with its club drivers;
the club drivers, who never boost, are the slowest by 2–3 s. Tokyo (257–274 s
against its 255 s song) and Aizu (148–161 s, 161 s song) finish close to the
end of their songs; Kyoto (225–239 s, 209 s song) and Nara (192–206 s, 179 s
song) run 7–15% long. Irohazaka (240–256 s against its
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
pure pursuit steering and the same control bits a player presses. It moves
off the line for traffic, and back, at 8 m/s: away from a bend the wheel winds
on slowly at speed, and a sudden swerve overshot into the rails (instant moves
doubled the AI's rail contact at Harbor Run), while at 5 m/s a quicker car
stayed boxed in behind the pack. The Arcade
circuits' bends are 253–760 m in radius, so there no bend limits that speed, no
driver brakes and the engine holds the rev limiter; the drivers differ in how
they use the boost. A burst's extra speed coasts down slowly, so long bursts
gain far more than short ones: club drivers never fire it, pro drivers wait for
85% of a tank and ace drivers for 95%. A driver boosts past a car once its own
path is clear, and an ace whose build has drift charge drifts through every
bend. The AI has not been calibrated against measured human lap times. The
garage balance, and the race time each part card shows (`RACE_GAINS`), are
measured on this model with the AI and with keyboard reference drivers that
steer late, lift and brake when they run wide and keep their own boost habits;
see [garage-tech-tree.md](garage-tech-tree.md).
