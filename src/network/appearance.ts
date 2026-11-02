import { ed25519 } from '@noble/curves/ed25519';
import { validateClubAppearance, type ClubAppearance } from '../game/catalog';
import { BUILD_KEYS, BUILD_KEYS_V1, upgradeCarBuild, validateCarBuild, type CarBuild } from '../game/car-builds';
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

/**
 * A racer's car as built (car-builds.ts), announced beside the appearance packet and signed the same way: by the
 * session's gameplay key, bound to its scope and slot. A separate kind leaves the appearance packet unchanged, so a
 * client from before builds still reads appearances and merely rejects this packet. Presentation only: it never
 * reaches the physics, the proof transcript or settlement.
 */
export interface BuildPacket {
  kind: 'build'; version: 1 | 2; scope: string; slot: number;
  build: CarBuild; signature: string;
}
/**
 * Version 2 signs every current key (BUILD_KEYS); version 1, from the first release, signed the first format's keys
 * (BUILD_KEYS_V1) and is still read, its later options at their factory parts.
 */
const buildPayload = (version: 1 | 2, scope: string, slot: number, build: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify(
  [`sora-cars/build/v${version}`, version, scope, slot, ...(version === 1 ? BUILD_KEYS_V1 : BUILD_KEYS).map(key => build[key])]));
export function signBuild(scope: string, slot: number, build: CarBuild, key: Uint8Array): BuildPacket {
  const body = { kind: 'build' as const, version: 2 as const, scope, slot, build: validateCarBuild(build) };
  return { ...body, signature: hex(ed25519.sign(buildPayload(2, scope, slot, body.build as unknown as Record<string, unknown>), key)) };
}
export function verifyBuild(raw: unknown, scope: string, roster: readonly RaceParticipant[]): BuildPacket {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'build,kind,scope,signature,slot,version') throw new Error('Invalid car build packet.');
  const p = raw as BuildPacket;
  if (p.kind !== 'build' || (p.version !== 1 && p.version !== 2) || p.scope !== scope || !Number.isInteger(p.slot) || !roster[p.slot] || typeof p.signature !== 'string' || !/^[0-9a-f]{128}$/.test(p.signature)) throw new Error('Car build packet scope or sender mismatch.');
  // A version 1 build has exactly the first format's keys; version 2 exactly the current ones.
  const signed = p.build as unknown;
  if (!signed || typeof signed !== 'object' || Array.isArray(signed) || Object.keys(signed).sort().join(',') !== [...(p.version === 1 ? BUILD_KEYS_V1 : BUILD_KEYS)].sort().join(',')) throw new Error('Invalid car build packet.');
  const build = p.version === 1 ? upgradeCarBuild(signed) : validateCarBuild(signed);
  if (!ed25519.verify(unhex(p.signature), buildPayload(p.version, p.scope, p.slot, build as unknown as Record<string, unknown>), unhex(roster[p.slot]!.inputKeyHex), { zip215: false })) throw new Error('Car build signature rejected.');
  return { ...p, build };
}
