import { RACE_RULES_HASH } from './environment';
import { createRace, raceFinished, replayState, validateReplay, type RaceState, type ReplayV1 } from './engine';
import { validateClubAppearance, type ClubAppearance } from './catalog';
import { RULES, TRACKS } from './rules';
import { isStockTune, stepTunedRace, validateTune, type CarTune } from './tuned-engine';

/** A local garage race. Per-car tunes change the arithmetic, so it carries its own
 * rules identity and is never offered as a RaceV1 transcript, proof or settlement.
 * `baseRulesHash` pins the RaceV1 relation the tuned engine reproduces at stock.
 */
export const GARAGE_RULES = 'SoraGarageV1';
export interface GarageReplayV1 {
  version: 1; rules: typeof GARAGE_RULES; baseRulesHash: string; trackId: number;
  names: string[]; skins: number[]; tunes: CarTune[]; inputs: number[][]; savedAt: string; source: 'practice';
  appearances?: ClubAppearance[];
}
export type LocalReplay = ReplayV1 | GarageReplayV1;
export const isGarageReplay = (replay: LocalReplay): replay is GarageReplayV1 => replay.rules === GARAGE_RULES;

export function validateGarageReplay(value: unknown): GarageReplayV1 {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid replay');
  const r = value as GarageReplayV1, cars = Array.isArray(r.names) ? r.names.length : 0;
  if (r.version !== 1 || r.rules !== GARAGE_RULES || r.baseRulesHash !== RACE_RULES_HASH || !TRACKS[r.trackId] || cars < 2 || cars > 8
    || r.names.some(name => typeof name !== 'string' || name.length > 64) || !Array.isArray(r.skins) || r.skins.length !== cars || r.skins.some(n => !Number.isInteger(n) || n < 0 || n > 5)
    || !Array.isArray(r.tunes) || r.tunes.length !== cars || !Array.isArray(r.inputs) || r.inputs.length > RULES.maxTicks
    || r.inputs.some(row => !Array.isArray(row) || row.length !== cars || row.some(v => !Number.isInteger(v) || v < 0 || v > 63))
    || r.source !== 'practice' || typeof r.savedAt !== 'string' || !Number.isFinite(Date.parse(r.savedAt))) throw new TypeError('Invalid or unsupported garage replay');
  const tunes = r.tunes.map(validateTune);
  if (tunes.every(isStockTune)) throw new TypeError('A stock garage race is a RaceV1 replay');
  if (r.appearances !== undefined && (!Array.isArray(r.appearances) || r.appearances.length !== cars)) throw new TypeError('Cosmetic replay roster mismatch');
  r.appearances?.forEach(validateClubAppearance);
  const state = createRace(r.trackId, cars);
  for (const row of r.inputs) { if (raceFinished(state)) throw new TypeError('Replay contains trailing terminal frames'); stepTunedRace(state, row, tunes); }
  return structuredClone({ ...r, tunes });
}
export function validateLocalReplay(value: unknown): LocalReplay {
  return (value as LocalReplay | null)?.rules === GARAGE_RULES ? validateGarageReplay(value) : validateReplay(value);
}
export function localReplayState(replay: LocalReplay): RaceState {
  if (!isGarageReplay(replay)) return replayState(replay);
  const state = createRace(replay.trackId, replay.names.length);
  for (const row of replay.inputs) stepTunedRace(state, row, replay.tunes);
  return state;
}
