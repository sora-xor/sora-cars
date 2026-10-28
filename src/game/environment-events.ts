import type { RaceState } from './engine';
import type { TrackObjectKind } from './environment';

export interface EnvironmentContact {
  /** Native tick at which the generated circuit reported contact. */
  readonly tick: number;
  readonly slot: number;
  readonly kind: TrackObjectKind;
  readonly objectId: number;
}
const contacts = new WeakMap<RaceState, readonly Readonly<EnvironmentContact>[]>();
const empty = Object.freeze([]);
/** Presentation only: these records are never serialized into simulation state or proofs. */
export function environmentContacts(state: RaceState): readonly Readonly<EnvironmentContact>[] {
  return contacts.get(state) ?? empty;
}
/** Only circuit outputs and bounded batches of those outputs supply contacts. */
export function setEnvironmentContacts(state: RaceState, value: readonly EnvironmentContact[]): void {
  contacts.set(state, Object.freeze(value.map(contact => Object.freeze(contact))));
}
/** Preserve immutable presentation evidence when isolating a state snapshot. */
export function copyEnvironmentContacts(source: RaceState, destination: RaceState): void {
  const value = contacts.get(source);
  if (value) contacts.set(destination, value);
}
