import { encodeGameValueV1, decodeGameValueV1 } from '@iroha/iroha-js/game';
import { ed25519 } from '@noble/curves/ed25519';
import { activeScope, inputDigest, inputSigningFrame, keyBytes } from './certificates';
import type { GameInputCommitmentV1, GameInputRevealV1, GameTranscriptV1 } from '@iroha/iroha-js/game';
import type { GameReplayEvidenceV1 } from '@iroha/iroha-js/game-replay';
import { raceControlsFromPayloadV1, raceGameTranscriptV1 } from '@iroha/iroha-js/race';
import type { RaceReplayV1, RaceResultV1, RaceSettlementResultV1 } from '@iroha/iroha-js/race';
import type { RaceRecord } from './races';

/** Pure source/replay consistency. Accepted-history authentication and finality
 * remain native verifier responsibilities. Nothing here authorizes settlement. */
export function validateDrivingProjection(record: RaceRecord, replay: RaceReplayV1, evidence: GameReplayEvidenceV1): GameReplayEvidenceV1 {
  const value = decodeGameValueV1('GameReplayEvidenceV1', encodeGameValueV1('GameReplayEvidenceV1', evidence)) as GameReplayEvidenceV1;
  const full = value.transcript, terminal = replay.frames.length, slots = record.participants.length;
  if (terminal > record.next_tick || record.next_tick > 5400 || full.batches.length !== Math.ceil(record.next_tick / 6)) throw new Error('Complete accepted history does not reach the source frontier.');
  const removals = new Map<number, number>(); let prior = -1;
  for (const event of full.dnf_events) {
    if (event.tick >= 5400 || event.tick > record.next_tick || event.tick % 6 || event.tick <= prior || !event.slots.length) throw new Error('Invalid accepted removal chronology.');
    prior = event.tick; let previousSlot = -1;
    for (const slot of event.slots) {
      if (slot >= slots || slot <= previousSlot || removals.has(slot)) throw new Error('Invalid accepted removal slot.');
      removals.set(slot, event.tick); previousSlot = slot;
    }
  }
  record.participants.forEach((p, slot) => { if (p.dnf_at_tick !== (removals.get(slot) ?? null)) throw new Error('Accepted removal history differs from the source roster.'); });
  full.batches.forEach((batch, index) => {
    if (batch.start_tick !== index * 6 || batch.inputs.length !== slots) throw new Error('Accepted inputs must preserve every original slot and interval.');
    batch.inputs.forEach((bytes, slot) => {
      if ((removals.get(slot) ?? Infinity) <= batch.start_tick) { if (bytes.length) throw new Error('Removed input slot retains controls.'); }
      else raceControlsFromPayloadV1(bytes);
    });
  });
  // Compare removal values, not object key order: canonical JSON exports sort keys, decoded rows follow the schema.
  const removalTimes = (events: readonly { tick: number; slots: ArrayLike<number> }[]) => JSON.stringify(events.map(event => [event.tick, Array.from(event.slots)]));
  if (removalTimes(replay.dnf_events) !== removalTimes(full.dnf_events.filter(event => event.tick <= terminal))) throw new Error('Physical replay omits or rewrites a removal at its terminal boundary.');
  replay.frames.forEach((frame, tick) => {
    const batch = full.batches[Math.floor(tick / 6)];
    if (!batch || frame.tick !== tick || frame.controls.length !== slots) throw new Error('Physical replay input chronology differs.');
    frame.controls.forEach((word, slot) => {
      const bytes = batch.inputs[slot]!, offset = (tick % 6) * 2;
      if (word !== (bytes.length ? bytes[offset]! | bytes[offset + 1]! << 8 : 0)) throw new Error('Physical replay controls differ from accepted inputs.');
    });
  });
  const retained = [...record.source_record.certified_batches, ...record.source_record.forced_batches].sort((a, b) => a.start_tick - b.start_tick);
  for (let index = 0; index < retained.length; index++) {
    const row = retained[index]!;
    if (index && row.start_tick === retained[index - 1]!.start_tick) throw new Error('Accepted history repeats a retained interval.');
    const batch = full.batches[row.start_tick / 6];
    if (!batch || JSON.stringify(batch.inputs) !== JSON.stringify(row.inputs)) throw new Error('Accepted history rewrites a retained consensus batch.');
  }
  for (const forced of record.source_record.forced_batches) {
    const batch = full.batches[forced.start_tick / 6];
    if (!batch || JSON.stringify(batch.inputs) !== JSON.stringify(forced.inputs)) throw new Error('Accepted history rewrites a forced consensus batch.');
    if (JSON.stringify(full.dnf_events.find(e => e.tick === forced.start_tick)?.slots ?? []) !== JSON.stringify(forced.dnf_slots)) throw new Error('Accepted history rewrites forced removals.');
  }
  return value;
}
/** Economic projection corresponding to native game_binding::racing_settlement.
 * Late consensus removals do not mutate the proven physical terminal state. */
export function settlementResult(result: RaceResultV1, throughTick: number, full: GameTranscriptV1): RaceSettlementResultV1 {
  if (throughTick < result.ticks || throughTick > 5400) throw new Error('Invalid economic frontier.');
  const removed = new Map(full.dnf_events.flatMap(e => e.slots.map(slot => [slot, e.tick] as const)));
  const standings = result.standings.map(s => {
    const tick = removed.get(s.slot) ?? null;
    if (s.dnf_tick !== (tick !== null && tick <= result.ticks ? tick : null)) throw new Error('Physical result differs from consensus removal times.');
    return { ...s, dnf_tick: tick };
  }).sort((a, b) => Number(a.dnf_tick !== null) - Number(b.dnf_tick !== null) || (a.finish_tick !== null && b.finish_tick !== null ? a.finish_tick - b.finish_tick : a.finish_tick !== null ? -1 : b.finish_tick !== null ? 1 : Number(BigInt(b.progress_mm) - BigInt(a.progress_mm))) || a.slot - b.slot);
  const eligible = standings.filter(s => s.dnf_tick === null), first = eligible[0];
  let winners: number[] = [];
  if (first?.finish_tick !== null && first?.finish_tick !== undefined) winners = eligible.filter(s => s.finish_tick === first.finish_tick).map(s => s.slot);
  else if (eligible.length === 1) winners = [first!.slot];
  else if (result.ticks === 5400 && first) winners = eligible.filter(s => BigInt(s.progress_mm) === BigInt(first.progress_mm)).map(s => s.slot);
  else if (eligible.length) throw new Error('Multiple unfinished eligible racers cannot claim an early terminal result.');
  return { physical_terminal_tick: result.ticks, accepted_through_tick: throughTick, standings, winners: winners.sort((a, b) => a - b) };
}

/** Assemble only public evidence actually available to this browser. Missing
 * accepted rows or nonce-bearing reveals are errors, never neutral substitutes. */
export function collectAcceptedHistory(record: RaceRecord, replay: RaceReplayV1,
  observed: { commitments: GameInputCommitmentV1[]; reveals: GameInputRevealV1[] }): GameReplayEvidenceV1 {
  if (replay.frames.length > record.next_tick) throw new Error('The observed ledger has not retained this driving frontier yet.');
  const source = record.source_record, full = raceGameTranscriptV1(replay);
  const removals = new Map<number, number[]>();
  source.participants.forEach((participant, slot) => { if (participant.dnf_at_tick !== null) { const slots = removals.get(participant.dnf_at_tick) ?? []; slots.push(slot); removals.set(participant.dnf_at_tick, slots); } });
  full.dnf_events = [...removals].sort(([a], [b]) => a - b).map(([tick, slots]) => ({ tick, slots }));
  for (const batch of full.batches) batch.inputs.forEach((_, slot) => { const removal = source.participants[slot]!.dnf_at_tick; if (removal !== null && removal <= batch.start_tick) batch.inputs[slot] = []; });
  for (const batch of [...source.certified_batches, ...source.forced_batches].sort((a, b) => a.start_tick - b.start_tick)) {
    const index = batch.start_tick / 6;
    if (index < full.batches.length) continue;
    if (index !== full.batches.length) throw new Error('A complete accepted transcript interval is unavailable.');
    full.batches.push({ start_tick: batch.start_tick, inputs: structuredClone(batch.inputs) });
  }
  const scope = activeScope(source);
  const matchesContext = (item: GameInputCommitmentV1 | GameInputRevealV1, slot: number) => item.session_id === source.session_id && item.slot === slot && String(item.epoch) === String(source.epoch) && item.start_tick === source.next_tick && item.scope.manifest === scope.manifest && item.scope.admission === scope.admission;
  const copiedPending = source.pending_certificate !== null && ['forced_reveal', 'settled'].includes(source.phase.kind)
    && source.pending_certificate.commitments.length === source.input_commitments.length
    && source.input_commitments.every((value, slot) => value === source.pending_certificate!.commitments[slot]);
  const commitments: GameInputCommitmentV1[] = [];
  source.input_commitments.forEach((digest, slot) => {
    if (digest === null || copiedPending) return;
    const item = observed.commitments.find(item => matchesContext(item, slot) && item.commitment === digest);
    if (!item) throw new Error(`Missing public signed commitment for original slot ${slot}.`);
    const { signature, ...body } = item;
    const rawSignature = Uint8Array.from(signature.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16));
    if (!ed25519.verify(rawSignature, inputSigningFrame(source.network_id, body), keyBytes(source.participants[slot]!.input_key), { zip215: false })) throw new Error('Invalid public commitment signature.');
    commitments.push(item);
  });
  const reveals: GameInputRevealV1[] = [];
  source.input_reveals.forEach((payload, slot) => {
    if (payload === null) return;
    const item = observed.reveals.find(item => matchesContext(item, slot) && JSON.stringify(item.payload) === JSON.stringify(payload) && inputDigest(source.network_id, item) === source.input_commitments[slot]);
    if (!item) throw new Error(`Missing matching public nonce-bearing reveal for original slot ${slot}.`);
    reveals.push(item);
  });
  return validateDrivingProjection(record, replay, { transcript: full, current_commitments: commitments, current_reveals: reveals });
}
