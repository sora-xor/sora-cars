import { ed25519 } from '@noble/curves/ed25519';
import { validateClubAppearance, type ClubAppearance } from '../game/catalog';
import { hex, unhex, type RaceParticipant } from './session';
export interface AppearancePacket {
  kind: 'appearance'; version: 1; scope: string; slot: number;
  appearance: ClubAppearance; signature: string;
}
const payload = (p: Omit<AppearancePacket, 'signature'>) => new TextEncoder().encode(JSON.stringify(['sora-cars/appearance/v1', p.version, p.scope, p.slot, p.appearance.skin, p.appearance.upgrade]));
/** A gameplay-key signature authenticates a cosmetic choice, never NFT ownership or performance. */
export function signAppearance(scope: string, slot: number, appearance: ClubAppearance, key: Uint8Array): AppearancePacket {
  const body = { kind: 'appearance' as const, version: 1 as const, scope, slot, appearance: validateClubAppearance(appearance) };
  return { ...body, signature: hex(ed25519.sign(payload(body), key)) };
}
export function verifyAppearance(raw: unknown, scope: string, roster: readonly RaceParticipant[]): AppearancePacket {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'appearance,kind,scope,signature,slot,version') throw new Error('Invalid cosmetic packet.');
  const p = raw as AppearancePacket;
  if (p.kind !== 'appearance' || p.version !== 1 || p.scope !== scope || !Number.isInteger(p.slot) || !roster[p.slot] || typeof p.signature !== 'string' || !/^[0-9a-f]{128}$/.test(p.signature)) throw new Error('Cosmetic packet scope or sender mismatch.');
  const appearance = validateClubAppearance(p.appearance);
  if (!ed25519.verify(unhex(p.signature), payload({ ...p, appearance }), unhex(roster[p.slot]!.inputKeyHex), { zip215: false })) throw new Error('Cosmetic signature rejected.');
  return { ...p, appearance };
}
