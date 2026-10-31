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
(acceleration into engine power, top speed into the rev limiter, corner load
into tyre grip, contact and impact losses into toughness, and so on).

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
  cornering limit, so full lock corners as hard as the car can and a tap at
  250 km/h is a gentle correction. The front wheels also follow the body's
  sideslip, which countersteers a slide automatically while keeping the front
  tyre's natural yaw damping. Holding drift lowers rear grip and allows more
  steering to swing the tail.
- **Stability control.** Outside a drift, a capped yaw moment keeps yaw near
  the steering's request and sideslip small; a hard hit still spins the car.
  In a drift only spin protection remains.

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
nothing below 3 m/s (about 11 km/h), then `0.9 x + 0.12 x²` points for the
excess `x`, times the car's toughness. Points are shared between the front,
rear, left and right zones by where the contact landed. A crushed nose costs
engine power, side damage costs grip, rear damage costs traction, torn
bodywork adds drag, and uneven side damage pulls the steering.

Twelve panels break away at fixed zone thresholds (`CAR_PARTS` in
`damage.ts`): number plates, bumpers, pop-up headlights, bonnet, boot lid,
mirrors and doors. At 100 points (`DAMAGE_LIMIT`) the car is **wrecked**: the
engine dies, the car slides to a stop, smokes and burns, stays solid for three
seconds and is then towed. A wrecked car is out of the race (大破 / WRECKED).
When the player is wrecked, the rest of the field races on and the results
follow. A head-on hit at about 30 m/s wrecks a car outright; light contact and
glancing rail hits only scuff it.

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
course and prints finishing times, contacts, wrecks and stalls. In the last
run every car finished every course without a wreck or a stall. Arcade races
take 77–109 s. Tokyo (265–273 s), Aizu (152–158 s), Kyoto (228–237 s) and Nara
(192–206 s) finish within about 10% of their soundtracks. Irohazaka (245–259 s
against its 187 s song) is slower than the earlier draft model, whose 3 g
acceleration and 9 g braking made its twenty hairpins nearly free; the driving model gives
street races 12,000 ticks (400 s) so slower drivers can still finish. The AI
follows a minimum-curvature racing line at a grip-limited speed with pure
pursuit steering and the same control bits a player presses; it has not been
calibrated against measured human lap times. The garage balance tables in
`docs/garage-tech-tree.md` were measured on the earlier tuned engine.
