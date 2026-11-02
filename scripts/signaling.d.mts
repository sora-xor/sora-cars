import type { WebSocketServer } from 'ws';

/** Optional untrusted signaling relay and bounded public feed (scripts/signaling.mjs). */
export function createSignalingRelay(options?: { host?: string; port?: number }): WebSocketServer;
