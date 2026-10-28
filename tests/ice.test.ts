import test from 'node:test';
import assert from 'node:assert/strict';
import { iceConfiguration, parseIceServers } from '../src/network/ice';

test('NAT settings preserve explicit TURN credentials with no assumed provider', () => {
  assert.deepEqual(iceConfiguration(parseIceServers(''), false), { iceServers: [], iceTransportPolicy: 'all' });
  const servers = parseIceServers(JSON.stringify([{ urls: 'stun:localhost:3478' }, { urls: ['turn:127.0.0.1:3478?transport=udp', 'turns:[::1]:5349?transport=tcp'], username: 'public-game', credential: 'short-lived-token' }]));
  assert.deepEqual(iceConfiguration(servers, true), { iceServers: servers, iceTransportPolicy: 'relay' });
  assert.throws(() => iceConfiguration(parseIceServers('[{"urls":"stun:localhost"}]'), true), /TURN/);
});

test('NAT settings reject unexpected fields, credential leaks, invalid URLs and unbounded configuration', () => {
  for (const server of [{ urls: 'https://relay.example' }, { urls: 'turn://user:secret@relay.example' }, { urls: 'turn:relay.example/path' }, { urls: 'turn:relay.example:65536' }, { urls: 'stun:relay.example?transport=tcp' }, { urls: 'turn:relay.example', username: 'missing-password' }, { urls: 'stun:relay.example', username: 'u', credential: 'p' }, { urls: 'turn:relay.example', credentialType: 'oauth' }, { urls: [] }, { urls: Array(9).fill('turn:localhost') }]) assert.throws(() => parseIceServers(JSON.stringify([server])));
  assert.throws(() => parseIceServers(JSON.stringify(Array(9).fill({ urls: 'turn:localhost' }))), /eight/);
  assert.throws(() => parseIceServers(' '.repeat(16 * 1024 + 1)), /16 KiB/);
});
