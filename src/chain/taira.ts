/** Public genesis-derived identity, pinned independently of the selected Torii endpoint.
 * Source: iroha/configs/soranexus/taira/explorer.runtime-config.json and
 * iroha/scripts/taira_constants.py. Changing networks requires a reviewed release.
 */
export const TAIRA_NETWORK_ID = 'hash:0466DA18C70CA8CBD51B8CC60B1D4A4802FC5D7F928D505806D7CD6CB61D60EF#BA85';
export const TAIRA_TORII_URL = 'https://taira.sora.org';

/** Build-time overrides support independently reviewed deployments and local qualification. */
export function releaseNetworkId(override?: string): string {
  return override || TAIRA_NETWORK_ID;
}
