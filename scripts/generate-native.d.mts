export interface NativeGenerationOptions {
  appRoot: string;
  nativeRoot: string;
  binary: string;
  evidenceDir: string;
  expectedCliSha256: string;
  install: boolean;
}
export function nativeGenerationOptions(env?: NodeJS.ProcessEnv, args?: string[]): NativeGenerationOptions;
export function validateNativeExports(kernels: unknown, parity: unknown): void;
export function generateNative(options: NativeGenerationOptions): Promise<{ installed: boolean; status: string; evidenceDir: string }>;
