# GridClaimV1 — independent game adapter specification

Implementation target for foundation goals F2 and F7, selected September 28,
2026. This document specifies a second computation; no adapter, proof, profile
registration, settlement or qualification result is claimed yet. Changes before
qualification must update this document and regenerate its rules identity.

## Purpose and interface

Two players move and claim cells on a fixed 4 by 4 board for at most 32
simultaneous turns. It exercises bounded state, conditional actions, public
lookups, contested writes, scoring and technical wins without any racing fields.
The adapter uses the same generic Game ISIs, immutable admission, accepted input
history, record binding, resource limits, proof envelope and payout mechanism.
It introduces no game-specific instruction or custody authority.

The compiled manifest fixes exactly two participants, one logical tick per
input batch, 32 maximum ticks, one input byte per participant and empty
participant application data. Application parameters are the canonical typed
version marker only; callers cannot supply a board, transition program, score
table or weaker proof parameters. This first demonstration requires no equipment
resources. Generic opt-in NFT wagers and XOR stakes remain ledger obligations,
with funded admission closed until qualification.

## Canonical state and inputs

Cells are numbered `4 * y + x`, with `x,y` in `0..=3`; north decreases `y`.
Permanent roster slots are zero and one. State contains:

- Completed turn count `0..=32`.
- Two positions `0..=15`, initially `0` and `15`.
- Two energy values `0..=4`, initially `4`.
- Sixteen owners: `0` for neutral, `1` for slot zero, `2` for slot one.
  Every cell is initially neutral.
- Two active bits and optional removal turns, derived only from accepted
  consensus history. Both slots are initially active.

The one-byte control codes are:

| Code | Action |
| --- | --- |
| 0 | Rest |
| 1, 2, 3, 4 | Move north, east, south, west |
| 5 | Claim the current cell |
| 6, 7, 8, 9 | Claim the adjacent north, east, south, west cell |

Bytes `10..=255` and active input payload lengths other than one are malformed
and must be rejected before accepted input admission or proof construction.
Inactive slots have the sole canonical control zero in consumed simulation
rows. The generic ledger's empty payload for a newly removed slot is a history
representation, not a malformed active input. No alternative bit encodings or
unused padding are accepted.

A valid code can request an unavailable move or claim. Such a request has the
explicit no-op behavior below; it cannot make an already accepted history
unprovable. Tests for an illegal move reject a proof claiming that movement
succeeded, rather than declaring the whole accepted batch invalid.

## One transition, in fixed order

At transition index `t`, the state has completed `t` turns. Apply precisely the
removal events accepted for `t` before interpreting controls. A removed slot is
inactive permanently. If fewer than two slots remain active, terminate at `t`
without consuming another batch. Distinct removal events at the same boundary
are applied together; iteration order cannot create an early technical winner.
Only boundaries `0..=31` can accept removals. At 32 the generic session is
already awaiting its proof; no extra terminal-removal window is introduced.
If a forced round records a technical win at `t`, its ledger frontier can be
`t + 1` and retain the survivor's input and removed slot's empty payload.
The adapter binds that complete accepted record but consumes neither payload
after simulation has terminated at `t`.

Otherwise consume both accepted controls and resolve the following phases from
the same previous state:

1. **Rest:** code zero increases that slot's energy by one, capped at four.
2. **Movement intentions:** a move needs energy at least one and an in-bounds
   adjacent target. If either condition fails, position and energy are unchanged.
   Each affordable in-bounds attempt spends one energy, even if it collides.
3. **Movement conflicts:** if the two intended destinations are equal, both
   slots retain their previous positions. Otherwise both intentions execute.
   A stationary slot's intention is its current cell, so moving into it fails.
   Swapping two distinct positions succeeds. No slot-order tie breaker exists.
4. **Claim intentions:** a claim needs energy at least two and an in-bounds
   target selected by its code. Claimants do not move during this turn. Each
   valid claim attempt spends two energy; unavailable attempts change nothing.
5. **Contested writes:** distinct valid targets acquire their respective
   claimant's owner value, including overwriting a prior owner's cell. If both
   valid claims target the same cell, its previous owner remains and both
   claimants still pay the energy cost. Untouched cells retain their owners.
6. Increment the turn count exactly once. At count 32, terminate with the
   eligibility already selected by accepted removal events at prior boundaries.
   No control or new removal is accepted after termination.

Only one action code applies to each slot, so rest, move and claim energy costs
cannot overlap. Arithmetic is ordinary bounded integer arithmetic; field wrap,
negative energy, out-of-board positions and noncanonical owner values are
invalid witnesses. The two positions remain distinct by induction. A removed
slot does not reclaim cells or alter prior scores.

## Terminal result and payout

Score for a slot is the exact count of its owner value across all sixteen cells,
in `0..=16`. With two eligible slots at turn 32, the higher score wins; equal
scores list both slots as winners in increasing order. A sole remaining slot
receives a technical win regardless of score. With neither slot eligible,
the winner list is empty and the generic equal-winners-or-refund policy refunds
original stakes. Removed slots can never receive a competitive award.

The opaque typed result contains the terminal turn, both scores, both
eligibility bits, removal turns and canonical final state. Generic
`GameOutcomeV1` carries the terminal tick and the exact winner list derived from
that result. The ledger derives transfer obligations from its retained terms;
the proof does not nominate arbitrary payment destinations or NFT owners.

## Relation and acceptance obligations

The native reference and compiled constraints must agree on decoding, adjacent
cell selection, range and Boolean checks, movement conflict resolution, energy,
all sixteen writes, removals, termination, score counts and winner selection.
The relation binds the exact manifest, admission, full current record, original
accepted controls and removal history before challenges. It authenticates every
checkpoint/state boundary and every lookup table. A caller-signed false state
must not replace a proven transition from genesis.

The verifier must check the proof without rerunning the witness transition
graph. Padding rows are explicit inactive identities with canonical zero
controls and no further score, position, energy or ownership changes. Their
selector cannot bypass the terminal boundary. Profiles remain compiled and
closed; registration does not accept arbitrary constraint code.

Required reference vectors cover boundaries in every direction, zero/one/two/
four energy, rest saturation, a stationary blocker, same-destination conflict,
a swap, failed claims, contested claims with neutral and owned targets,
overwrites, ties, simultaneous removals, rejection of removal at boundary 32,
preservation of unused technical-win source payloads and padding.
Adversarial proofs must reject changed targets, fabricated energy, missing
writes, score inflation, unauthorized controls/removals, altered checkpoints,
changed session/rules/record and a racing proof under this profile.

F7 also requires genuine native proof generation and independent verification,
fresh native/SDK fixtures, CLI/worker invocation without racing-only fields,
and generic lifecycle/escrow/NFT settlement on four real validators including
restart. Reference vectors or a locally self-consistent source record alone do
not satisfy that gate.
