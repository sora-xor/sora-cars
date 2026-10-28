import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NATIVE_KERNEL_SOURCES, NATIVE_PROFILE_SOURCES, verifyNativeSources } from '../scripts/lib/native-sources.mjs';

function fixture() {
  const content = new Map(NATIVE_PROFILE_SOURCES.map(name => [name, Buffer.from(`source:${name}`)]));
  const profile_sources = Object.fromEntries([...content].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
  const sources = Object.fromEntries(NATIVE_KERNEL_SOURCES.map(name => [name, profile_sources[`crates/iroha_core/src/execution_proofs/${name}`]!]));
  return { content, kernels: { sources, profile_sources }, read: async (name: string) => content.get(name)! };
}

test('native generator verifies the full committed source set and rejects stale admission with identical physics', async () => {
  const { content, kernels, read } = fixture();
  await verifyNativeSources(kernels, read);
  content.set('crates/iroha_data_model/src/game.rs', Buffer.from('changed required admission'));
  await assert.rejects(verifyNativeSources(kernels, read), /CLI is stale for crates\/iroha_data_model\/src\/game.rs/);
});

test('native generator rejects absent, extra, malformed and inconsistent provenance before file installation', async () => {
  const { kernels, read } = fixture();
  await assert.rejects(verifyNativeSources({ sources: kernels.sources }, read), /profile source catalog/);
  for (const changed of [
    { ...kernels.profile_sources, '../../outside': '0'.repeat(64) },
    { ...kernels.profile_sources, 'crates/iroha_data_model/src/game.rs': 'bad' },
  ]) await assert.rejects(verifyNativeSources({ ...kernels, profile_sources: changed }, read), /profile source catalog/);
  await assert.rejects(verifyNativeSources({ ...kernels, sources: { ...kernels.sources, 'race.rs': '0'.repeat(64) } }, read), /source identities disagree/);
});

test('native generator rejects omitted or changed immutable history bounds', async () => {
  const { content, kernels, read } = fixture();
  const path = 'crates/iroha_data_model/src/game_retention.rs';
  assert.ok(content.has(path));
  const omitted = structuredClone(kernels);
  delete omitted.profile_sources[path];
  await assert.rejects(verifyNativeSources(omitted, read), /profile source catalog/);
  content.set(path, Buffer.from('changed retained history bounds'));
  await assert.rejects(verifyNativeSources(kernels, read), /CLI is stale for crates\/iroha_data_model\/src\/game_retention.rs/);
});
