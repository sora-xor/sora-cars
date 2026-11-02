#!/usr/bin/env node
// Optional untrusted transport. Receivers independently verify signatures and game scope.
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
/** Replaceable bounded transport. Opening it grants no game or wallet authority. */
export function createSignalingRelay({ host = '127.0.0.1', port = 8788 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid signaling port.');
  const server = new WebSocketServer({ host, port, maxPayload: 32 * 1024 });
  const subscriptions = new Map(), watches = new Map(), feeds = new Map(), rooms = new Map(), pending = new Map();
  const validScope = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const validSlot = value => Number.isInteger(value) && value >= 0 && value <= 7;
  /** Bytes a socket may hold unsent, and the public history a room keeps for late watchers. */
  const SOCKET_BUFFER = 256 * 1024, HISTORY = 1024 * 1024;
  const send = (socket, data) => { if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < SOCKET_BUFFER) socket.send(data); };
  // A watcher's verified feed cannot skip a packet: after one gap it rejects every later one ("does not extend the
  // certified frontier") and stalls for good. So feed packets queue per watcher and go out as its socket drains, a
  // late watcher's whole history included. A watcher two histories behind is closed, to rejoin from the history or
  // a signed snapshot, rather than left with a gap. Queues hold the same strings as the history and the live feed.
  function pump(socket, out) {
    while (out.packets.length && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < SOCKET_BUFFER) {
      const data = out.packets.shift(); out.bytes -= Buffer.byteLength(data);
      socket.send(data, () => { if (feeds.get(socket) === out) pump(socket, out); });
    }
  }
  function feed(socket, data) {
    const out = feeds.get(socket); if (!out) return;
    out.packets.push(data); out.bytes += Buffer.byteLength(data);
    if (out.bytes > 2 * HISTORY) { feeds.delete(socket); watches.delete(socket); socket.close(1013, 'feed backlog'); return; }
    pump(socket, out);
  }
  function room(scope) {
    if (!rooms.has(scope)) { if (rooms.size >= 64) rooms.delete(rooms.keys().next().value); rooms.set(scope, { packets: [], bytes: 0, truncated: false }); }
    return rooms.get(scope);
  }
  server.on('connection', socket => {
    let count = 0;
    const rate = setInterval(() => { count = 0; }, 1000);
    socket.on('message', bytes => {
      if (++count > 64) { socket.close(1008, 'rate limit'); return; }
      try {
        const packet = JSON.parse(bytes.toString('utf8'));
        if (packet.type === 'watch') {
          if (!validScope(packet.scope)) throw new Error('invalid watch scope');
          watches.set(socket, packet.scope); feeds.set(socket, { packets: [], bytes: 0 });
          const history = room(packet.scope);
          if (history.truncated) send(socket, JSON.stringify({ type: 'snapshot_required' }));
          else history.packets.forEach(data => feed(socket, data));
          return;
        }
        if (packet.type === 'subscribe') {
          if (!validScope(packet.scope) || !validSlot(packet.slot)) throw new Error('invalid subscription');
          subscriptions.set(socket, { scope: packet.scope, slot: packet.slot });
          for (const [key, route] of pending) {
            if (route.expiry < Date.now()) { pending.delete(key); continue; }
            if (route.scope === packet.scope && route.to === packet.slot) { send(socket, route.data); pending.delete(key); }
          }
          return;
        }
        const sender = subscriptions.get(socket);
        if (!sender || packet.scope !== sender.scope || packet.from !== sender.slot) throw new Error('invalid route');
        if (packet.type === 'game') {
          if (!packet.packet || packet.packet.scope !== sender.scope || packet.packet.slot !== sender.slot) throw new Error('invalid public game packet');
          const data = JSON.stringify(packet.packet), history = room(sender.scope);
          history.packets.push(data); history.bytes += Buffer.byteLength(data);
          while (history.bytes > HISTORY) { history.bytes -= Buffer.byteLength(history.packets.shift()); history.truncated = true; }
          for (const [watcher, scope] of watches) if (scope === sender.scope) feed(watcher, data);
          return;
        }
        if (!validSlot(packet.to)) throw new Error('invalid signaling recipient');
        let delivered = false;
        for (const [peer, subscription] of subscriptions) if (peer !== socket && subscription.scope === sender.scope && subscription.slot === packet.to) { send(peer, bytes.toString('utf8')); delivered = true; }
        if (!delivered) {
          if (pending.size >= 512) pending.delete(pending.keys().next().value);
          pending.set(`${sender.scope}:${sender.slot}:${packet.to}`, { scope: sender.scope, to: packet.to, data: bytes.toString('utf8'), expiry: Date.now() + 60_000 });
        }
      } catch { socket.close(1008, 'invalid packet'); }
    });
    socket.on('close', () => { clearInterval(rate); subscriptions.delete(socket); watches.delete(socket); feeds.delete(socket); });
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const host = process.env.SORA_SIGNAL_HOST ?? '127.0.0.1';
  const server = createSignalingRelay({ host, port: Number(process.env.SORA_SIGNAL_PORT ?? '8788') });
  server.on('listening', () => console.log(`Optional SORA CARS signaling relay: ws://${host}:${server.address().port}. Signed packets are buffered in bounded memory; there is no game authority or private key storage.`));
}
