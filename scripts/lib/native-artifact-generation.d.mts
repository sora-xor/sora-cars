export interface NativeCleanupAction {
  resource: string;
  run: () => void | Promise<void>;
}
export interface NativeCleanupReport {
  cleanupErrors?: { context: string; resource: string; name: string; message: string; errors?: unknown[] }[];
  primaryError?: { name: string; message: string; errors?: unknown[] };
}
/** Successful cleanup leaves a caller's pending original exception untouched. */
export function cleanupNativeResources(actions: readonly NativeCleanupAction[], primaryError: unknown, report: NativeCleanupReport, context: string): Promise<void>;
import type { NativeGenerationOptions } from '../generate-native.mjs';
export interface NativeArtifactProfile {
  computation: string;
  artifacts: Record<string, string>;
  sourcePaths: readonly string[];
  verifySources: (kernels: any, read: (name: string) => Promise<Buffer>) => Promise<void>;
  validateExports: (kernels: any, parity: any) => void;
  kernelCommand: string;
  parityCommand: string;
  kernelFile: string;
  parityFile: string;
  provenanceFile: string;
  kernelByteLimit: number;
  parityByteLimit: number;
  generatorUrl: string | URL;
  sourceVerifierUrl: string | URL;
  provenanceFields: (kernels: any, parity: any) => Record<string, unknown>;
}
export interface NativeArtifactReport extends NativeCleanupReport {
  installed: boolean;
  status: string;
  evidenceDir: string;
  commands: { argv: string[]; cwd: string; pid: number | null; exitCode: number | null; signal: string | null; timedOut: boolean }[];
  generator: Record<string, string>;
  capturedBinary?: { path: string; bytes: number; sha256: string; launcher: { source: string; retained: string; bytes: number; sha256: string } };
}
export function generateNativeArtifacts(options: NativeGenerationOptions, profile: NativeArtifactProfile): Promise<NativeArtifactReport>;
