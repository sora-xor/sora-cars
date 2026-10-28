export const NATIVE_PROCESS_LIMITS: Readonly<{ timeoutMs: number; outputBytes: number; terminateGraceMs: number; reapGraceMs: number }>;
export function runNativeProofProcess(binary: string, args: string[], cwd: string, timeoutMs?: number, limits?: { outputBytes?: number; terminateGraceMs?: number; reapGraceMs?: number }): Promise<string>;
