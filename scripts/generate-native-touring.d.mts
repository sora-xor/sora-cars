import type { NativeGenerationOptions } from './generate-native.mjs';
export function touringGenerationOptions(env?: NodeJS.ProcessEnv, args?: string[]): NativeGenerationOptions;
export function validateTouringExports(kernels: unknown, parity: unknown): void;
export function generateNativeTouring(options: NativeGenerationOptions): Promise<{ installed: boolean; status: string; evidenceDir: string }>;
