export type NativePackerMode = 'iroha-toolkit' | 'standalone';
export interface NativePackerSelection { binary: string; mode: NativePackerMode }
export interface LocalPackReceipt {
  version: 1;
  kind: 'sora-cars-local-native-pack';
  mode: NativePackerMode;
  binary: string;
  binary_sha256: string;
  source_commit_authenticated: false;
  source_payload_bytes: number;
  native_timeout_ms: number;
  commands: string[][];
  native: null | {
    native_root_cid_hex: string;
    car_archive_blake3: string;
    manifest_blake3: string;
    requested_replicas: 3;
  };
  published: false;
  provider_availability_verified: false;
  provider_payload_prepared: boolean;
}
export function selectNativePacker(env: Record<string, string | undefined>): NativePackerSelection;
export function nativePackTimeoutMs(payloadBytes: number): number;
export function packSoraFs(options: NativePackerSelection & { root?: string; out?: string }): Promise<LocalPackReceipt>;
