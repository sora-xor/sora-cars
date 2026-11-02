import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createSignalingRelay } from '../scripts/signaling.mjs';

// A spectator verifies every public feed packet in order, so one dropped packet stalls it for good ("Message does not
// extend the certified frontier"). The relay used to skip packets for a socket with 256 KiB unsent: a late watcher
// joining a long race lost the end of the history, and the real-browser spectator test stalled under load.
test('the relay delivers a late or stalled watcher every feed packet in order', async () => {
  const relay = createSignalingRelay({ port: 0 });
  await once(relay, 'listening');
  const url = `ws://127.0.0.1:${(relay.address() as { port: number }).port}`, scope = 'ab'.repeat(32);
  const sockets: WebSocket[] = [];
  const open = async () => { const socket = new WebSocket(url); sockets.push(socket); await once(socket, 'open'); return socket; };
  const watch = async () => {
    const socket = await open(), seen: number[] = [];
    socket.on('message', (data: Buffer) => { const packet = JSON.parse(data.toString()) as { n?: number; type?: string }; seen.push(packet.n ?? -1); });
    socket.send(JSON.stringify({ type: 'watch', scope }));
    return { socket, seen, tcp: (socket as unknown as { _socket: { pause(): void; resume(): void } })._socket };
  };
  try {
    const stalled = await watch();
    const driver = await open();
    driver.send(JSON.stringify({ type: 'subscribe', scope, slot: 0 }));
    await new Promise(resolve => setTimeout(resolve, 50));
    // Close to the relay's 1 MiB history in 8 KB packets, within its 64-a-second rate limit, while one watcher reads nothing.
    stalled.tcp.pause();
    const pad = 'x'.repeat(8000), total = 120;
    for (let n = 0; n < total; n++) {
      driver.send(JSON.stringify({ type: 'game', scope, from: 0, packet: { scope, slot: 0, n, pad } }));
      if (n % 60 === 59) await new Promise(resolve => setTimeout(resolve, 1050));
    }
    // A late watcher joins and pauses too, as a busy page does: the history must wait for it.
    const late = await watch();
    late.tcp.pause();
    await new Promise(resolve => setTimeout(resolve, 300));
    stalled.tcp.resume(); late.tcp.resume();
    const every = Array.from({ length: total }, (_, n) => n);
    for (let wait = 0; wait < 100 && (stalled.seen.length < total || late.seen.length < total); wait++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(stalled.seen, every, 'a watcher that stopped reading');
    assert.deepEqual(late.seen, every, 'a watcher that joined late');
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => relay.close(resolve));
  }
});
