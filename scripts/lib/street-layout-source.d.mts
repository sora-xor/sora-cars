export const STREET_LAYOUT_SOURCE: string;
export const STREET_LAYOUT_COPY: string;
export const STREET_LAYOUT_METADATA: string;
export const STREET_LAYOUT_BROWSER: string;
export function streetLayoutArtifacts(bytes: Uint8Array): {
  browser: Buffer;
  metadata: {
    schema: string;
    source: { key: string; sha256: string; bytes: number };
    rust: { path: string; sha256: string; bytes: number };
    browser: { path: string; sha256: string; bytes: number };
    scope: string;
  };
  metadataBytes: Buffer;
};
export function readNativeStreetLayout(irohaRoot?: string): Promise<{ root: string; path: string; bytes: Buffer }>;
export function verifyStreetLayout(irohaRoot?: string): Promise<Awaited<ReturnType<typeof readNativeStreetLayout>> & ReturnType<typeof streetLayoutArtifacts>>;
