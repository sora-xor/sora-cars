# Composed street race draft

This is a native-authored, bounded host computation for local development. It is **not an execution proof, admitted ledger profile, or permission to enable stakes**. The graph now comes from the selected Iroha Core compiler through its credential-free CLI. The application belongs in the generic execution/game framework; it does not introduce race-specific ISIs.

## One computation for Rust and the browser

The production compiler's private motion recipe composes handling, contact, roadside hazards and lifecycle for rosters two through eight. `npm run world:race` invokes `iroha --machine app execution export-street-motion` from an independently pinned executable. It exports that exact graph, canonical genesis frame and immutable Tokyo geometry/object tables. App-authored visual/audio metadata is accepted only when every fixed road, gate and hazard value agrees. The browser executes the exported graph through the closed `StreetGraph` interpreter; no standalone Rust generation harness remains.

The loader preserves the selected native export, executable and exact source digests. Native/browser parity sends batches of at most 256 input rows to `evaluate-street-motion`, using one privately retained executable copy per corpus. The Native API checks the exact compiler-family identity and complete input shape; rejected scalar rows remain explicit nulls. These local results do not authenticate user-supplied removal flags, prove the boundary/motion sequence, or establish ledger finality.

Every graph node is evaluated, including unused branches. Arithmetic stays strictly inside the exact integer range ±2^50. Positive division truncates toward zero; comparisons and selects use Boolean values. Narrowed assertions are checked eagerly. Constants are interned in first-use order to reduce graph size without eliminating assertions. The selected Core lowerer also constrains these rules; exporting or interpreting this scalar graph does not itself exercise that proof.

Each car stores progress/lateral position, speed, body and velocity yaw, energy, its next gate, status and an exact finish fraction. The world additionally carries a shared broken-object mask, initially zero. Cosmetics do not change physical dimensions or performance. The native grid uses two columns and four possible rows. The race clock runs at 30 ticks per second. The Tokyo development format allows 9,000 ticks for its supplied 254.952-second recording; this is a new draft format, not an extension of the existing 5,400-tick profiles.

## Swept contacts

Handling first computes the full free motion. Wall clipping before the shared contact solve is forbidden because it changes the time parametrization of that motion. Cars use road-coordinate axis-aligned boxes with half-length 1,800 mm and half-width 900 mm. Visual body rotation does not change the collider.

The solver compares continuous slab intersection intervals using bounded integer cross-products. It chooses events on a 65,536-part tick clock, rounding contact times down and adding 2 mm of contact padding. At most two velocity components per actor can be removed, bounding resolution to twice the roster size. Equal-time events use a fixed order: walls before car pairs, then actor IDs and axes. A collision removes the affected components from both actors; it never adds an impulse or transfers positive kinetic energy.

Unstopped axes retain their original tick anchor and evaluate `old + trunc(delta * elapsed / 65536)`. Repeated unrelated events cannot accumulate extra rounding or shift a free path. Stopped axes freeze at their event position. Physical overlap at the beginning of an active step rejects. Separating, sliding and comoving touches do not block. Finished/forfeited cars are ghosts.

Circuits select the nearest phase image while retaining each racer's unwrapped progress. Cars on different laps can therefore collide. Sprints use their actual unwrapped separation. Geometry length and maximum motion bound the valid image selection.

Walls use a conservative corridor. Start, midpoint and free endpoint widths cover all crossed cells under the 6 m step and 4.9 m minimum cell bounds. If the old car is outside the upcoming narrower corridor, longitudinal motion stops for this tick while lateral escape remains possible inside the current corridor. Otherwise the minimum corridor applies to the entire sweep. There is no unchecked final position clamp. This is deliberately a conservative rule, not exact collision time against a continuously varying roadside wall.

After resolution, both orientations are expressed in the final road frame. Remaining speed is projected onto any surviving axis; a wall contact dissipates a further 25%. Zero projected momentum takes the body direction, preventing fictitious slip on the next launch. Throttle supplies bounded crawl steering even when a previous contact stopped the car, while steering alone at rest cannot spin it.

## Oil and breakaway roadside objects

The immutable catalog contains at most 16 oil zones, portable potted saplings and breakaway signs. Gate-relative authoring compiles to integer road-coordinate rectangles. Native kind selects a fixed effect; authors cannot change penalties. Catalog admission checks dimensions, protected grid/finish space and nonoverlapping prop footprints. The compiler/browser additionally check the full footprint against every crossed road-width station. These are authored arcade hazards, not claims about objects present on a historical road.

Oil samples expanded-car-footprint occupancy at tick start and changes handling grip to 12/256. Swept contact is separate feedback, so crossing into a zone changes the next tick's grip. Oil is never destroyed. The exact swept test intersects each axis's integer slab window on all 65,537 subtick poses, including the endpoints. The path is `old + sign(freeDelta) * min(abs(resolvedDelta), floor(abs(freeDelta) * u / 65536))`. A straight chord from start to resolved endpoint would be wrong when the contact solver stops axes at different times.

An intact sign retains 224/256 of post-car/wall speed; a potted sapling retains 160/256. Losses compose in catalog order with integer truncation. These are end-of-tick dissipative breakaway effects. They cannot change resolved positions, checkpoints or finish fractions. Every active car that touches a prop intact at tick start receives the effect; the shared bit becomes broken at tick end. No slot consumes an impact before another slot. Broken bits persist on later laps and terminal padding. Invalid oil bits and bits beyond the catalog reject.

The renderer reads this catalog and native mask for intact/fallen geometry, and native oil/impact feedback for HUD/audio. Transient debris is presentation only. Replay exports include the ordered catalog. Moving cars/bikes as non-racer traffic, and collisions with immovable roadside trunks, remain separate work.

The host graph admission cap is 131,072 nodes; the current twelve-object eight-car composition has 101,808 nodes. This is a bounded development interpreter limit, not a STARK trace-size, verifier-resource or security parameter.

## Gates and outcomes

The compiled lifecycle contains between two and 64 strictly ordered milestones, separated by at least 4,900 mm. A forward sweep can consume only the expected consecutive gates, at most two per tick. Reverse crossing and stationary contact cannot advance the cursor.

Finishes retain the integer tick and the exact ratio `(finishProgress - oldProgress) / originalFreeProgressDelta`. The denominator must describe the original full tick, even when a collision stops the car after it crosses the finish. Progress carries 6 m of headroom past the maximum 80 km finish so a bound cannot silently change that denominator. Rankings compare fractions by integer cross-products, with exact ties retaining equal competition ranks.

Statuses are running, finished, forfeited and timed out. The last permitted tick may finish; other running racers become timed out and remain eligible. Eligible finishers rank first by finish time, then unfinished eligible racers by gate/progress. Forfeits rank below every eligible racer. A sole eligible racer yields a technical result; all-forfeit yields a refund outcome. The draft accepts an explicit consensus-forfeit input for testing; a browser must never be allowed to authorize it in a funded ledger session.

Terminal host outcomes freeze the clock, shared broken mask, carried car state and speed; padding evaluates all nodes but cannot drive, change ranking or apply a later forfeit. Transient contact/driving feedback clears on padding. Rain/wind feedback is derived from the carried tick and is not a separate stored state field. `StreetRaceSession` only commits a new state after successful evaluation, records controls, and reconstructs replay state without accepting a supplied final ranking.

## Local lab and evidence

Generate and package an explicit pinned native export using the [root commands](../../README.md), then run `npm run dev` and open `/street-lab.html`. The lab has seven input-driven opponents, keyboard/gamepad/touch controls, pause/rematch, local replay export and the supplied Tokyo theme. It uses the compiled Cartesian road points for rendering, separate from the fixed-step simulation. The lab is an explicit development entry and is not part of the production hash-route menu.

Run `npm run test:street-hazards` for the independent subtick oracle and `npm run test:street-race-hazards` for complete-graph oil and prop fixtures with Rust/browser parity. Run `npm run test:street-race` for roster checks, complete-race native/browser comparison, replay reconstruction, invalid inputs and terminal padding. `npm run test:street-lab` exercises actual browser controls, audio, reduced motion and full-race completion. Reports under `output/qualification/street-race` and `output/browser/street-lab` identify the exact tested bundle. A generated bundle or passed module test alone does not establish full-race completion.

## Qualification still required

The model still needs interactive moving traffic, eight human clients and adverse networking, historical road/art review, skill and soundtrack pacing, and supported-device performance qualification. Weather is currently a deterministic rain/wind schedule. Oil and breakaway props are native interactions; decorative people, bikes and buildings are not collision actors.

The [checked scalar lowerer](SCALAR_CONSTRAINTS.md) now constrains all graph operations, narrowed assertions and exact geometry selection from verifier-compiled constants. Proof work must bind that compiled geometry and context to the admitted profile, constrain trace continuity and initial/final states, and bind accepted signed inputs and dispute decisions to the ledger statement. The staged AIR must preserve every existing collision-selection and inactive-branch equation. The complete trace/degree/size analysis, at least 128-bit whole-proof security argument, independent cryptographic review, CPU/accelerated parity, validator costs, escrow settlement, finality verification and Taira/SoraFS rollout remain required. SHA-256 source packaging and host parity do not provide those guarantees.
