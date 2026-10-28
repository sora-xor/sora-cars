import { LiveRacingPanel as ProductionLiveRacingPanel } from '../src/ui/live';
import { botControl, copyRace, createRace, raceFinished, stepRace, type ReplayV1 } from '../src/game/engine';
import { environmentAt, environmentContacts, RACE_PROFILE_ID, RACE_RULES_HASH } from '../src/game/environment';
import type { MultiplayerPhase, MultiplayerRaceController } from '../src/network/controller';

type Host = ConstructorParameters<typeof ProductionLiveRacingPanel>[0];

/** Test-only import wrapper. The production entry point never imports this file.
 * The actual panel constructor and main callbacks remain intact. This explicit
 * local counterpart exercises UI lifecycle; it has no peers, ledger, or keys.
 */
export class LiveRacingPanel extends ProductionLiveRacingPanel {
  constructor(host: Host) {
    super(host);
    const names = ['YOU', '試験ドライバー'], skins = [0, 1];
    let state = createRace(0, 2);
    const inputs: number[][] = [], capturedInputs: number[] = [];
    const advance = () => {
      const row = state.cars.map(car => botControl(state, car.slot));
      inputs.push(row); stepRace(state, row);
    };
    for (let tick = 0; tick < 120; tick++) advance();
    const baseline = copyRace(state), baselineInputs = inputs.map(row => [...row]);
    const restoreBaseline = () => { state = copyRace(baseline); inputs.splice(0, inputs.length, ...baselineInputs.map(row => [...row])); };
    let phase: MultiplayerPhase = 'racing';
    const counterpart = {
      get state() { return copyRace(state); },
      get predictedState() { return copyRace(state); },
      get status() { return { phase, reason: 'Explicit local lifecycle counterpart', connectedSlots: [1], certifiedTick: state.tick, predictedTick: state.tick }; },
      get appearances() { return names.map(() => ({ skin: null, upgrade: null })); },
      exportReplay(): ReplayV1 {
        return { version: 1, rules: 'RaceV1', rulesHash: RACE_RULES_HASH, trackId: 0,
          names: [...names], skins: [...skins], inputs: inputs.map(row => [...row]),
          savedAt: new Date(0).toISOString(), source: 'multiplayer' };
      },
      stop() { phase = 'stopped'; host.status(phase, 'Explicit local counterpart stopped'); },
    } satisfies Pick<MultiplayerRaceController, 'state' | 'predictedState' | 'status' | 'appearances' | 'exportReplay' | 'stop'>;
    Object.assign(window, { lifecycleLive: {
      scope: 'Actual main UI/audio, explicit local controller counterpart; no peer, wallet, proof, finality, or settlement qualification.',
      identity: { rules: RACE_RULES_HASH, profile: RACE_PROFILE_ID },
      begin: () => {
        restoreBaseline();
        phase = 'racing';
        host.begin(counterpart as unknown as MultiplayerRaceController, names, skins, 0);
        host.status(phase, 'Explicit local counterpart racing');
      },
      phase: (next: MultiplayerPhase) => {
        phase = next; host.status(next, `Explicit local counterpart ${next}`);
      },
      captureInput: () => { const word = host.input(); capturedInputs.push(word); return word; },
      capturedInputs: () => [...capturedInputs],
      contact: (kind: 'tree' | 'sign') => {
        // Explicit bounded transition fixture, separate from the full initial-state
        // simulation restored by begin/finish. Events come from the real kernel.
        state = createRace(0, 2); state.tick = baseline.tick + (kind === 'tree' ? 6 : 12);
        const object = environmentAt(state.trackId, state.tick).objects.find(object => object.kind === kind)!;
        Object.assign(state.cars[0]!, { progress: object.progress - 500, x: object.x, speed: 1000 });
        stepRace(state, [1, 0]); host.state(copyRace(state), copyRace(state));
        return { object, contacts: environmentContacts(state), car: { ...state.cars[0]! } };
      },
      finish: () => {
        restoreBaseline();
        while (!raceFinished(state)) advance();
        host.state(copyRace(state), copyRace(state));
        phase = 'finished'; host.status(phase, 'Explicit local counterpart finished');
        host.finished();
      },
    } });
  }
}
