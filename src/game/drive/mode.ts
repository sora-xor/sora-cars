/** Local practice and story races use the rigid-body driving model.
 * `?physics=native` restores the native RaceV1 / street-draft arithmetic for
 * comparison. Live and staked races always use RaceV1.
 */
export function drivePhysics(): boolean {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('physics') !== 'native'; } catch { return true; }
}
