export const NATIVE_KERNEL_SOURCES: readonly string[];
export const NATIVE_PROFILE_SOURCES: readonly string[];
export const NATIVE_SOURCE_PATHS: readonly string[];
export function verifyNativeSources(
  kernels: { sources?: unknown; profile_sources?: unknown },
  readSource: (name: string) => Promise<Uint8Array>,
): Promise<void>;
