export const CLASSED_NATIVE_PROFILE_SOURCES: readonly string[];
export const CLASSED_NATIVE_KERNEL_SOURCES: Readonly<Record<string, string>>;
export function verifyClassedNativeSources(
  catalog: { computation?: unknown; class_id?: unknown; profile_sources?: unknown; sources?: unknown },
  readSource: (name: string) => Promise<Uint8Array>,
): Promise<void>;
