# Live races on the real 1986 roads: feasibility and plan

Status (2026-11-15): approved by the user as recommended (2026-11-12);
implementation in progress, not qualified (see "Implementation" at the end). The prototype and measurements in
the feasibility sections were built outside both repositories; their evidence
is in `output/reviews/live-real-roads-20261112/` in this worktree, which git
ignores, so copy it out before the worktree is removed.

## Summary

Local practice and story races already run each Arcade course on its real
road: a heading every 5 m from `src/game/generated/arcade-roads.json`, built
by `scripts/build-arcade-geography.ts`, read by `arcadePlan` and
`arcadeDriveCourse`. Live and staked races still run RaceV1, whose bends are
twelve cells per lap with curvature −3…3, mirrored natively by Iroha's
reference simulation, its STARK circuit and the browser kernels exported from
it.

RaceV1 can carry the real roads. The proposal keeps RaceV1 as the live
relation (same state, controls, contacts, six-tick batches, removals,
settlement and proof system) and replaces its twelve cells with a table of
the real road's bends, one entry per 5 m of the unrolled three-lap course,
committed into the rules hash. Measured on prototype circuits for a full
eight-car race:

- with a table lookup added to the proof engine, the proof grows by about 4%
  (1.66 → 1.73 MB) and proving CPU by about 5–10%;
- without touching the engine (selecting from the table with one-hot
  columns), the proof grows by 43–46% (to 2.37–2.42 MB, worst case 2.81 MB
  against the node's 3.25 MB cap) and proving CPU by about 50%.

Recommended choices, each explained below:

1. Implement in `~/dev/iroha-sora-cars-native`, the checkout sora-cars builds
   against, then port to `~/dev/iroha` (`optimizations`).
2. Read the table with a new fixed-table lookup in `iroha_execution_stark`.
   The engine belongs to Codex (agreed 2026-11-03), so this needs Codex or the
   user's go-ahead. The one-hot circuit is the fallback that needs no engine
   change.
3. Push cars outward with the bend's real centripetal effect (curvature ×
   speed²), calibrated so that holding the wheel balances 1.65 g and a held
   drift 2.57 g, near the driving model's grip.
4. Raise the race limit from 5,400 to 8,100 ticks (4 min 30 s). This still
   fits the same 2^13-row trace, so proof cost is unchanged.
5. Put RaceV1's wall at the drawn guard rail (±6.52 m instead of ±9 m) and
   make trees scenery, as local Arcade races already do.

The Tokyo street road table (the ledger member), the street draft compiler
and ClassedRaceV1/Touring are not changed.

## Which Iroha checkout

| Checkout | What it is | Evidence |
| --- | --- | --- |
| `~/dev/iroha-sora-cars-native` | A worktree of `~/dev/iroha`, detached at `c000f91384` (2026-09-08), with about 1,287 modified tracked files. RaceV1's node adapter is in `crates/iroha_core/src/execution_proofs/`. | `scripts/lib/native-source-root.mjs` resolves `../iroha-sora-cars-native/` and never falls back to `../iroha`. `package.json` depends on `file:../iroha-sora-cars-native/javascript/iroha_js`. `src/game/generated/provenance.json` (the qualified November 4 release) names it as `nativeRoot`, and its `race.rs`, `environment.rs` and `race_v1.rs` hashes match this tree byte for byte. |
| `~/dev/iroha` (`optimizations`) | The upstream development line (HEAD `01f3b627ea`, 2026-11-12; 48 files modified by other sessions). RaceV1's adapter moved to `crates/iroha_core_privacy`. | The engine `iroha_execution_stark` is committed here (`c63d346bc8`). Its sources match the native tree except `tests/race_oracle.rs`, which reads the adapter from a different path. The ZK inventories CI checks live only here (`specs/zk_operation_inventory.json`, `specs/fastpq/shared_backend_inventory.json`, `specs/zk_primitive_workloads.json`). |
| `~/dev/iroha-execution-stark-release` | Another worktree at `3743ff550c` (2026-11-05), the engine release line. | Its engine differs from the native tree's only in the README, a CPU-timing helper and the oracle test's path. |

Proposal: make and test the change in `iroha-sora-cars-native`, because
every sora-cars generator, fixture and SDK dependency reads it. Then port it
to `optimizations`, with Codex doing or reviewing the engine part, and
update the inventories there. Nothing outside sora-cars is edited until the
user confirms this.

In a sora-cars worktree, `nativeSourceRoot()` resolves to a path that does
not exist (`.claude/worktrees/iroha-sora-cars-native`). Set
`SORA_CARS_IROHA_ROOT=/Users/takemiyamakoto/dev/iroha-sora-cars-native` for
the native tests and generators.

## RaceV1 today

- **Rules** (`race.rs` `step_race_v1`, mirrored by `iroha_execution_stark`
  `games/race_v1.rs` `step` and its circuit). Thirty ticks per second, at
  most 5,400 ticks, three laps of 2.0 / 2.4 / 1.8 km (Midnight Circuit =
  Hakone, Harbor Run = Yokohama, Sakura Pass = Nikkō; the wire names are
  `NeonTokyo`, `Harbor`, `Sakura`).
  - The bend is `curve[floor(wrapped progress × 12 / lap)]`, and the push is
    `x += trunc(curve × speed / 120)`.
  - Steering builds lateral velocity, `vx = (vx + steer) × 7/8`. Holding the
    wheel settles at 7 × 18 = 126 mm/tick, or 196 while drifting.
  - Lateral position is clamped to ±9,000 mm, and beyond ±6,000 the car loses
    90 mm/tick each tick.
  - Twelve objects per lap: trees at ±7.4 m, signs at ±5.6 m, oil at ±1.8 m.
- **Rules identity.** `proof.rs` `RULES` spells out every rule, including
  `tracks=NeonTokyo/2000000/[0,1,2,…]`. The rules hash is its hash, and the
  profile ID also commits `PROFILE` and the source inventory
  `RACE_PROFILE_SOURCES_V1`.
- **Proof.** One trace row per tick, 2^13 rows. The twelve cells are read
  with one-hot columns (`one_hot_quotient` and `select_table`). Range checks
  are LogUp lookups into a 16-bit table that the verifier sums itself, after
  the prover sends its multiplicities.
- **Browser.** `src/game/engine.ts` runs kernels that the native CLI exports
  (`iroha … app execution export-kernels`) from the old integer AIR
  (`race_air.rs`, `integer_air.rs`). Its one-hot `lookup` is capped at 256
  rows. `tests/native-parity.test.ts` replays 21 native fixtures tick for
  tick.
  - `tuned-engine.ts` is a hand-written mirror for garage tunes. With the
    stock tune it must equal the kernels tick for tick
    (`tests/garage-tech.test.ts`).
- **Drawing.** `world.ts` `arcadeCourse` draws RaceV1's bends (turning
  `curve × 5/760` rad per 5 m) on the real road's heights. Local races draw
  `courseDrawing(arcadeDriveCourse(track))`, which is the real plan.
- **A quirk.** As drawn, a positive cell turns the road right, and the push
  moves the car right as well, toward the inside of the bend.

## The real road as RaceV1 data

Each Arcade course is three laps drawn end to end along one stretch of road.
The "laps" are therefore successive thirds of one 6.0 / 7.2 / 5.4 km road,
not repeats. The table is indexed by unwrapped progress, not by progress
within a lap:

- `station = floor((oldProgress + 100,000) / 5,000)`: 5 m stations from the
  100 m lead-in to the finish. That gives 1,221 / 1,461 / 1,101 entries; the
  grid's −12 m lies inside the lead-in. Cars freeze at the finish, so the
  run-off is not needed.
- Each entry is the bend between two consecutive 5 m headings of the local
  plan (`headingsE5`, radians × 10^5, clockwise). In exact integer form:
  `K = −round_half_away(Δh × 7,340,032 / 31,250,000)`, which equals
  `−round(κ[rad/m] × 7/1000 × 2^24)`. It is negative on right-hand bends, so
  the push is outward. |K| ≤ 7,826 (the 15 m minimum radius).
- `build-arcade-geography.ts` would emit the table alongside the plan, plus a
  generated Rust source for Iroha, with a `--check` mode for both. The local
  plan and the live table then cannot drift apart. The Rust source joins
  `RACE_PROFILE_SOURCES_V1`, and `RULES` carries a digest of each track's
  table, so the rules hash and profile ID bind the road.

Heights stay presentation only. RaceV1 accelerates at 40 mm/tick² (about
3.7 g), so even Hakone's 9.35% grade would change that by about 2.5%.

## Decision 1: keep RaceV1, change its bends

| Option | Verdict |
| --- | --- |
| **Keep RaceV1 and give it the real bends (recommended).** | It keeps the state layout, contacts, batches, removals, settlement, ISI and proof format. It changes only the bend rule, the tick limit and the wall. The relation keeps its name: nothing has launched (see the no-compatibility note of 2026-11-12), so the rules hash, profile ID and circuit IDs simply change. Old replays and fixtures are regenerated, and the qualification records in `output/` stay as history. |
| Prove the driving model | It is not practical. The model is floating point, with tyre curves, square roots and impulse collisions. A fixed-point port plus a circuit would be a new research project, and proof cost would grow by orders of magnitude. |
| Move live races to the street draft relation (`street_v1`) | That relation has a dense road table, but it is an unregistered compiler on the old guarded multilinear machinery. Its eight-player descriptors alone are about 168 MB, and it is not on the fast engine. |

## Decision 2: how the circuit reads the table

The table is 1,100–1,460 entries, which is too many for today's one-hot
selection. Three prototype circuits were built from a copy of
`games/race_v1.rs` linked against the unchanged engine. Each was proved and
verified against its own reference simulation, which the prover
cross-checks on every row.

Measured for 8 cars, 2^13 rows and full 5,400-tick traces on an M4 Max while
other sessions loaded the machine (load average 13–24). CPU is user seconds,
and wall times vary with load:

| Circuit | Main columns | Lookups | Proof | Worst-case bound | Prove CPU | Peak RSS |
| --- | --- | --- | --- | --- | --- | --- |
| Today (12 cells) | 1,321 | 576 | 1.66 MB | 2,044,445 B | 4.6–4.7 s | 1.56 GB |
| A: engine table lookup (cost proxy) | 1,361 | 632 | 1.73 MB | 2,112,989 B | 4.9 s | 1.63 GB |
| B: one-hot table, 5 m stations | 2,169–2,281 | 664 | 2.37–2.42 MB | 2.72–2.81 MB | 7.0–7.1 s | 2.29–2.34 GB |
| B: one-hot table, 10 m stations | 1,977–2,025 | 664 | 2.20–2.24 MB | 2.58–2.62 MB | 6.2–6.4 s | 2.10–2.13 GB |

In the quietest run, wall-clock proving took 0.50–0.64 s today, 0.62–0.67 s
for A and 0.77 s for B, and verifying took 12–13 ms in every case.

- **A, engine lookup (recommended).** The circuit declares a fixed table, and
  each car makes one lookup per tick of its station and coefficient. The
  engine already makes the prover send multiplicities for its 16-bit range
  table and has the verifier sum that table's side. A fixed table would get
  the same treatment, with its entries packed into one base-field value and
  kept disjoint from the range table (bound the coefficient with its own
  range check, or tag the table). The soundness term grows by the table size
  in `(lookups·n + table)/|Fp4|`, a negligible amount.
  - Engine work: the builder API, AIR and prover multiplicities, verifier
    sum, proof encoding of the extra multiplicities, the circuit's canonical
    bytes, and the `specs/execution_stark_v1.md` section with its tests.
  - Any later game with a map or terrain table can reuse it.
  - The proxy row has the same cost shape (station quotient, coefficient
    column, one more lookup per car). The real feature adds only the table's
    multiplicities, a few KB.
- **B, no engine change.** The station is split into high and low one-hot
  selectors of about 27 × 55, at 106–120 extra columns per car. Everything
  lives in the RaceV1 circuit. It fits the node's 3.25 MB proof cap and 4 MiB
  envelope with less headroom, and it costs about half again more proving
  time and memory.

## Decision 3: how a bend pushes a car

If today's push (`curve × speed / 120`, with curve = 760 κ, the drawing
scale) were used with real curvature, a 15 m hairpin would allow only
32 km/h (50 km/h drifting). Every bend wider than about 120 m would be flat
out. Speed limits would scale with 1/κ instead of the physical 1/√κ.

The recommendation is the centripetal form `x += trunc(K × speed² / 2^24)`,
applied where today's push is (before the wall clamp and objects). It equals
seven ticks of centripetal acceleration, so it balances a held wheel at
1.65 g and a held drift at 2.57 g:

| Bend radius | Corner speed, holding the wheel | Corner speed, drifting |
| --- | --- | --- |
| 15 m (tightest) | 56 km/h | 70 km/h |
| 50 m | 102 km/h | 128 km/h |
| 100 m | 145 km/h | 181 km/h |
| 200 m | 205 km/h | 256 km/h |
| flat out (259 km/h) | from 320 m | from 206 m |

Best possible race times with ideal braking and the steady-state corner
limits (`ideal-race-times.txt`):

| Course | Holding the wheel | Drifting | Driving model, 8 stock AI cars | Same model on the old 12-cell bends |
| --- | --- | --- | --- | --- |
| Hakone | 2:41 | 2:15 | 2:44–2:56 | 1:22–1:26 |
| Yokohama | 2:09 | 2:00 | 2:24–2:38 | 1:38–1:43 |
| Nikkō | 1:21 | 1:18 | 1:23–1:30 | 1:14–1:17 |

Live races would therefore last about as long as local races on the same
roads.

Calibration still to do: rain and oil. Rain's 15/16 damping lets lateral
velocity build higher (195 mm/tick against 126), so with this force rain
would add cornering authority. Scaling the bend force in the wet, or keeping
rain's steering cut, needs checking with the reference keyboard drivers.

## Decision 4: race length

On Hakone a perfect driver needs 2:15–2:41, and real players will be slower,
so 5,400 ticks (3:00) is too short. 8,100 ticks (4:30, a whole number of
six-tick batches) still fits the 2^13-row trace, which holds up to 8,191
ticks, so proof size and time do not change. Making that change touches:

- `RACE_MAX_TICKS_V1` and the engine's `MAX_TICKS`;
- the registry manifest template (`max_ticks`);
- the `iroha_js` codecs and race helpers, which hard-code 5,400;
- sora-cars `RULES.maxTicks`, `network/session.ts`, `chain/{races,history,certificates}.ts`, the result label in `main.ts` and the kernel runtime's tick check;
- batch counts: 900 → 1,350.

Local races keep their five-minute limit (9,000 ticks).

## Decision 5: walls and hazards

RaceV1 lets a car run to 9 m from the centre line, 2.4 m beyond the guard
rail the world draws at 6.6 m. On the real roads that is over quay edges,
sea walls and gorges. Local Arcade races already stop at the rail face
(6.52 m) and leave trees as scenery (`drive/setup.ts`).

Proposal:

- Clamp lateral position at ±6,520 mm, and clamp again after car-to-car
  contact.
- Keep the −90 mm/tick verge loss beyond ±6,000.
- Make trees non-colliding by removing tree impacts, or by moving trees to
  ±8,000, out of reach.
- Leave signs, oil, rain and wind unchanged. Objects keep their twelve
  positions per lap.

This decision is separable. If declined, live cars are drawn through the
rails.

## What changes where

**sora-cars**

- `scripts/build-arcade-geography.ts` and `arcade-roads.json`: emit the
  station table and the generated Rust table.
- `src/game/rules.ts`:
  - drop `curves` and `curvature()`;
  - add a road-table accessor;
  - set `maxTicks` to 8,100 and add the rail constant.
- `src/game/kernel-runtime.ts`: a table opcode and table validation.
- `src/game/generated/{race-v1-kernels,provenance}.json`: regenerate.
- `src/game/engine.ts` `botControl`: brake for the bends ahead and
  counter-steer against the push. Parity tests drive with it.
- `src/game/tuned-engine.ts`:
  - follow the new force, scaled by `cornerLoad/16` (stock is bit-identical);
  - set the rail and trees;
  - key drift charging off |K|.
- `src/game/garage-ai.ts` and `src/game/renderer.ts` (2D camera bend): read
  the table.
- `src/game/three/world.ts`:
  - delete `arcadeCourse`, which draws RaceV1's bends;
  - draw every Arcade race (local, live, replay, spectator) on
    `courseDrawing(arcadeDriveCourse(track))`.

  RaceV1 progress is the model's `s`, since the lap lengths are equal, and
  its lateral position maps one to one.
- `src/network/session.ts`, `src/chain/*.ts` and `src/main.ts`: the 8,100
  limit.
- Tests:
  - regenerate `tests/fixtures/native-race-v1.json`;
  - update `native-parity`, `garage-tech`, `engine`, `kernel-runtime`,
    `environment`, `chain` and `live-builds`;
  - add a test that the TS table equals the generated table.
- Docs: `driving-model.md`, `world/research/arcade/README.md`,
  `proof-workshop.md` and `gameplay-fidelity.md` lose "live races keep
  RaceV1's bends".

**Iroha (`iroha-sora-cars-native`, then `optimizations`)**

- `iroha_data_model/src/execution_proofs.rs`: `RACE_MAX_TICKS_V1 = 8_100`;
  `RaceTrackV1::curvature()` becomes the road table accessor.
- `iroha_core/src/execution_proofs/race.rs` and `environment.rs`: the
  station, the force, the rail, the post-contact clamp and the trees. Unit
  tests: `curvature_and_negative_division_are_exact`, the grid and object
  tests, and new table, rail and freeze tests.
- `proof.rs`: `RULES`, `PROFILE` (if option A adds a fixed table) and
  `RACE_PROFILE_SOURCES_V1` (plus the generated table source); the tick limit
  in statement and terminal checks. `registry.rs`: the manifest template.
- `iroha_execution_stark`:
  - option A: the fixed-table lookup (circuit, AIR, prover, verifier,
    proof codec, spec);
  - `games/race_v1.rs`: `step` and the circuit;
  - `tests/race_oracle.rs`;
  - `examples/race_bench.rs` and `race_census.rs` for the new numbers.
- `race_air.rs`, `integer_air.rs` and `kernel_export.rs` (browser kernels
  only): a table operation and its export.
- `javascript/iroha_js`: 5,400 → 8,100 in `noritoGameCodecs.js`, `race.js`
  and `raceOutcomes.js`, with their tests.
- `optimizations` only: the `iroha_core_privacy` adapter, plus the three ZK
  inventories and their checkers:
  - `scripts/check_zk_operation_inventory.py --no-compile` (about 4 min);
  - `scripts/check_zk_primitive_workloads.py` (about 10 min);
  - `cargo test -p fastpq_prover --test shared_backend_inventory`.

**Not changed**

- Tokyo's street road table and `street_v1`.
- ClassedRaceV1/Touring: it is unregistered, used only by
  `tests/classed-harness.ts` and still on the old `stark/` engine. Moving it
  is a follow-up when Touring is integrated.
- The track wire names.
- The SORA emblem and approved art.

## Order of work and checks

1. **Base.** The real-roads change is uncommitted in the main checkout
   (`master`, about 120 changed files). It must be committed first, so
   this branch can build on it, or the work happens in that checkout.
2. **Table.** Generate it in sora-cars and check it against `arcadePlan`.
3. **Native rules.** Update the data model, reference simulation, rules
   string and tick limit, then run their unit tests:
   `cargo test -p iroha_core execution_proofs::race` and the environment
   tests, with a private `CARGO_TARGET_DIR` and `--offline`.
4. **Circuit.** Option A (engine feature, via Codex) or option B. Then:
   - check every tick against native in release, as the full-race test in
     `race_v1.rs` does;
   - run `tests/race_oracle.rs`;
   - check `Params::check_security(…, 128)`;
   - record `race_bench` numbers and the size bound against 3.25 MB.
5. **Browser kernels.** Add the table operation, then
   `SORA_CARS_IROHA_ROOT=… SORA_CARS_IROHA_CLI=… SORA_CARS_IROHA_CLI_SHA256=… SORA_CARS_NATIVE_EXPORT_DIR=… npm run generate:native -- --install`.
   This needs a fresh `iroha` CLI build from the native tree.
6. **sora-cars.**
   - TS rules, bots and drawing; run the focused tests, then the full
     `npm test` (8–24 min), comparing its failure names against the
     18-failure baseline.
   - Browser checks on a static build: `test-live-ui`, `test-mesh`,
     `test-spectator`.
   - Labelled before | after frames of a live race at Hakone's hairpins.
7. **Calibration.** Run the reference keyboard drivers (rookie and regular)
   and the bots on all three roads: finish times within 8,100 ticks, rain
   and oil feel, rail contact.
8. **Port to `optimizations`.** The adapter in `iroha_core_privacy`, the
   engine with Codex, and the inventories. RaceV1 stays unqualified
   (`race_profile_is_qualified_v1() == false`), and qualification is
   separate work.

## Risks and open points

- **Engine ownership.** Option A changes Codex's engine. Without Codex, B
  works today at the measured cost.
- **Shared, modified native tree.** `iroha-sora-cars-native` carries about
  1,287 uncommitted changes from other work. Edits must stay within the
  files above, and builds use a private target directory.
- **Proof caps.** A stays far below the 3.25 MB proof cap. B's worst case
  (2.81 MB) fits but leaves about 14% headroom.
- **Feel.** Hairpins at 56–70 km/h after the straights are new for RaceV1.
  Bots, ghost drivers and the HUD timer need the real-road pace, and the
  songs end before the race (as they already do in local races).
- **Fixtures and evidence.** The rules hash, profile ID, circuit IDs,
  kernels, provenance and every parity fixture change. The November 4
  qualification evidence stays as history.

## Implementation

Changes in `~/dev/iroha-sora-cars-native` (none committed):

- **Engine (`iroha_execution_stark`).**
  - `Builder::fixed_table` and `Builder::lookup_table` add fixed tables as a
    second LogUp argument, with its own challenge (`logup-beta-tables`) and
    its own helper columns, sharing only the accumulator with the range
    argument.
  - The verifier sums both tables and checks each argument's counts exactly.
  - Circuit identity binds the tables, and table-free circuits keep their
    identity and transcript.
  - Documented in `specs/execution_stark_v1.md` and the crate README.
  - New engine tests cover proof round trips, table identity, exact
    per-argument counts, an off-table value, row decoding, malformed and
    extreme tables, and the adversarial harness below. All 54 engine tests
    and the 20 node-oracle tests pass.
  - A first design that merged the rows into the range table was replaced
    before testing: a range check could have been satisfied by a table row.
  - Codex reviewed the engine change as its owner (read-only, 2026-11-12):
    approve with changes, no blocker or major soundness defect. It
    independently reconstructed all 3,783 road coefficients. Its four
    requests were made:
    - table values are bounded before any arithmetic, and the packing
      constants use checked `i128`;
    - `Track::bend` and the node's `bend_force` refuse extreme progress
      instead of overflowing;
    - the stale `T <= 5400` limits were fixed;
    - an adversarial harness was added.
  - The harness forges table reads past the honest witness checks (a wrong
    value, a carry into the next key, a carry into the next table, a table
    row counted as a range value) at helper widths 1–4. It evaluates the AIR
    identities with honest helpers and with a range or table helper bent to
    close the accumulator, and every forgery fails an identity.
  - A mutation that left table helpers unchecked made the harness fail, as
    intended. The review, prompt and diff are in
    `output/reviews/live-real-roads-20261112/codex-engine-review/`.
- **Road data.** `games/race_v1_roads.rs` is generated by
  `scripts/generate-native-race-roads.ts` (with `--check`) from
  `arcade-roads.json`, using `src/game/race-roads-table.ts`. The values match
  the prototype's tables exactly.
- **Rules.**
  - The engine circuit and `step`, the node's `race.rs`/`environment.rs` and
    the browser-kernel generator (`race_air.rs`, `environment_air.rs`)
    implement the station table and the centripetal force.
  - Rails at ±6,520 mm, applied again after contacts.
  - Signs are the only objects that are hit.
  - The tick limit is 8,100 (`RACE_MAX_TICKS_V1`, registry, Stock bundle,
    proof checks).
  - The browser kernels carry each car's bend coefficient as a fifth per-car
    fixed value, read from the road table exported in the catalog. The
    generic integer AIR gains no new operation, and Touring keeps its
    layout.
  - `RULES` names each road table's SHA-256, checked by
    `rules_commit_to_every_road_table`. `PROFILE` names the table argument.
    The profile sources include the road table.
- **`iroha_js`.** 8,100-tick codec, removal and outcome bounds, and rails in
  the outcome state bounds. The outcome corpus's timeout vectors moved to
  8,100/8,101, and `sdk_outcome_corpus_is_the_native_result` checks the
  corpus against the node.

The real circuit, measured on 2026-11-12 under load average ~180, for eight
cars:

| | Today | Real roads |
| --- | --- | --- |
| Main columns | 1,321 | 1,385 |
| Lookups | 576 | 656 range + 8 table |
| Worst-case bound | 2,044,445 B | 2,158,833 B (Harbor; cap 3,250,000) |
| Security | 129.0 bits | 128.995 bits (128 required) |
| Proof | 1.66 MB | 1.77 MB |

Full races: prove 3.6 s at that load, verify 33–43 ms.

In sora-cars:

- The kernel runtime takes an explicit layout.
- `race-roads.ts` reads the native road table.
- The RaceV1 bot and the garage AI brake for the bends ahead and steer
  against the push.
- The tuned mirror follows the new rules (bit-identical at stock).
- Chain, network and replay bounds use `RULES.maxTicks` (8,100, 1,350
  batches).
- Tests are updated.

The real-roads base landed on master as `eaf5b70` (2026-11-15), and this
branch was rebased onto it. Since then, in sora-cars:

- Every Arcade race is drawn on its real road: `main.ts` `drawnCourse` gives
  live races, spectating and RaceV1 replays the same `DriveCourse` as local
  races, and `world.ts` lost `arcadeCourse` (RaceV1's drawn bends).
- `rules.ts` has no `curves` or `curvature()`. The 2D renderer's camera bend,
  aerial map and corner cue read the real road (`bendUnits`, `#roadCue`).
- Checkpoint and anchor bounds that still said 900 batches
  (`network/controller.ts`, `chain/proof.ts`) and the result label's 5,400
  now use `RULES.maxTicks`.
- Tests: drift charging picks real-road bends of strength 2 and 1; the
  multiplayer impact test hits a sign (trees are scenery); the city and
  streetscape tests build their courses from the real roads; the bend-force
  test takes Hakone's sharpest bends each way (its right-hand hairpin is
  K = -6,646, so the old search for K < -7,000 found none).
- Docs: `driving-model.md`, `period-city.md`, `world/README.md` and
  `world/research/arcade/README.md` no longer say live races keep RaceV1's
  bends.

Current native evidence (2026-11-15, release, load average ~300, sources
hashed in `output/reviews/live-real-roads-20261112/current-20261115/`): all
54 engine tests and 20 node-oracle tests pass. Full eight-car races
(`race_bench … 8 85 7`) prove and verify on all three roads:

| Road | Size bound | Proof | Soundness | Prove / verify |
| --- | --- | --- | --- | --- |
| Hakone | 2,157,873 B | 1,777,531 B | 129.0 bits | 16.8 s / 246 ms |
| Yokohama | 2,158,833 B | 1,778,817 B | 129.0 bits | 17.5 s / 231 ms |
| Nikkō | 2,157,393 B | 1,776,220 B | 129.0 bits | 14.9 s / 421 ms |

Status on November 16, 2026. RaceV1 qualification stays false
(`race_profile_is_qualified_v1() == false`). Records are in
`output/reviews/native-binding-20261115/`.

1. Done: the CLI export (`5d7b6789…`), the `iroha_js` `dist/` rebuild, and the
   merge into master (`51562ef`).
2. Done: the authenticated iroha_js native binding (`73aa032a…`), rebuilt in
   its warm target under the pinned single-job policy. It binds the native tree
   at `c000f91384` with this change, the re-exported corpus and the proof-test
   drivers below (`source_tree_sha256` `6e965355…`). The native checkout's HEAD is part of that
   provenance, so the commits below were made without moving it.
3. Native commits, on `~/dev/iroha` branch `sora-cars/native-real-roads-20261115`
   (signed, not pushed):
   - `259c7ba495`: the qualified November 4 native source. It reproduces that
     binding's source fingerprint exactly.
   - `add4d55e5d`: this change's 33 native files.
   - `ea57df8ed4`: the iroha_js current-proof corpus
     (`test/fixtures/game_current_proof_v1`), re-exported for the new profile.
     It carries the profile ID, so the chain and settlement tests refused the
     4 November corpus.
   - `0c7bb67fd3`: proof-test fixtures that drove flat out without steering now
     brake for bends and steer back to the centre (`careful_control`). On the
     real roads those cars parked on the verge, and four tests stopped at the tick
     limit.
4. Gates that pass:
   - the seven chain and checkpoint tests, and the settlement context;
   - `test-live-ui`, including a full 8,100-tick terminal replay;
   - `test-finality-browser`;
   - `test-spectator`, at load ~275 under a recorded 120 s screenshot deadline
     (`artifacts/spectator-browser.json`);
   - Touring, re-pinned to the edited data-model file with its rules unchanged;
   - the SDK's corpus tests;
   - native `iroha_core` execution-proof, captured-merge state and `isi::game`
     tests: 188 pass, 14 ignored. The registry current-wire test was skipped; it
     needs an explicitly supplied export folder.
5. Full `npm test` at load ~220: 772 tests, 763 pass. The 7 failures and 2
   cancellations are all in `live-terms` (a 45 s parent deadline) and
   `native-proof-process` (child processes with 1-3 s deadlines).
6. Still open:
   - `test-mesh` and the real-time phase of `test-speed-feel` need a quiet
     machine; their page loads and scene preparation ran past their deadlines
     at load 150-600 on November 15-16.
     `output/reviews/native-binding-20261115/quiet-gates/` runs them, plus the
     two timing-bound test files, once the load average stays under 35.
   - Labelled before/after frames of a live race at Hakone's hairpins.
7. Port to `optimizations`: branch `sora-cars/native-real-roads-on-optimizations`
   on `f06c6ea1f8` (signed, not pushed). Its commits:
   - `8d242469bd`: the change, three-way merged into the diverged
     `iroha_core_privacy` adapter.
   - `dbce2d4ab5`: the ZK inventories.
   - `aa1e0111e3`: rustfmt of the engine, approved by its owner, Codex. The
     generated road table carries `#[rustfmt::skip]` and stays byte-exact.
   - `504f52a393`: checked conversions that strict clippy asked for in the new
     road-table tests.

   Checks that pass:
   - 54 engine and 19 oracle tests;
   - 44 adapter tests;
   - the three ZK inventory checkers and the resource contract;
   - the 11 fastpq inventory tests;
   - the iroha_js race tests;
   - eight-car proofs, byte-identical to native's.

   Under strict clippy (`--all-targets -D warnings`) the engine, the data model,
   `iroha_core_privacy`, `iroha_core` and `integration_tests` pass. The run
   allows only the dead-code and unused-import errors that `f06c6ea1f8` already
   has in `iroha_core` files this branch leaves alone. `iroha_cli` does not
   compile at `f06c6ea1f8` itself (a syntax error in `gov/anonymous_ballot.rs`,
   which the owner is fixing), so the branch's one-line change there is not yet
   compiled. None of the branch's files fail `cargo fmt --check`. Its owner
   deferred landing while it qualifies a frozen snapshot of the shared tree;
   when it lands is the user's call.
