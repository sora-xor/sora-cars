import { AccountAddress } from '@iroha/iroha-js/address';

/** Compare native account controllers, not their network-specific display prefixes.
 * Callers must still validate the offer's pinned network and immutable terms.
 */
export function sameAccountIdentity(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string' || left !== left.trim() || right !== right.trim()) return false;
  try {
    const a = AccountAddress.fromI105(left).canonicalBytes();
    const b = AccountAddress.fromI105(right).canonicalBytes();
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
  } catch (error) {
    // Unavailable authenticated Node admission is not an invalid account and
    // must never be hidden by browser-style fallback or a failed comparison.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_IROHA_NATIVE_BINDING') throw error;
    return false;
  }
}
