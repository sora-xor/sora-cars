import type { FileHandle } from 'node:fs/promises';
export const nativeFileModulePath: string;
export function readBoundedNativeBytes(file: Pick<FileHandle, 'stat' | 'read'>, limit: number): Promise<Buffer>;
export function hashBoundedNativeFile(file: Pick<FileHandle, 'stat' | 'read'>, limit: number): Promise<{ bytes: number; sha256: string }>;
export function readBoundedNativeFile(path: string, limit?: number): Promise<Buffer>;
export function hashBoundedNativePath(path: string, limit: number): Promise<{ bytes: number; sha256: string }>;
export function readBoundedNativeJson(path: string, limit?: number): Promise<Record<string, any>>;
