// Mandatory actual native exports. No retired corpus, browser-authored proof or skipped gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeSourceRoot } from './native-source-root.mjs';
const sdk = join(nativeSourceRoot(), 'javascript/iroha_js');
const { loadCurrentGameWireCorpus, loadCurrentGameProofCorpus } = await import(pathToFileURL(join(sdk, 'test/helpers/gameCurrentWire.js')).href);
const sha256 = raw => createHash('sha256').update(raw).digest('hex');
export function currentGameFixtures() { return loadCurrentGameWireCorpus(); }
export function currentGameProofFixtures() {
  const file = resolve(process.env.SORA_CARS_GAME_CURRENT_PROOF_CORPUS ?? join(sdk, 'test/fixtures/game_current_proof_v1/fixtures.json'));
  const directory = dirname(file), fixture = loadCurrentGameProofCorpus();
  const provenance = JSON.parse(readFileSync(join(directory, 'provenance.json'), 'utf8'));
  assert.equal(provenance.schema, 'iroha.game.current-proof.provenance.v1');
  assert.equal(provenance.test_only, true);
  assert.equal(provenance.exporter_test, 'execution_proofs::proof::tests::genuine_stock_proof_rejects_rebound_revision_pending_frontier_and_economics');
  assert.equal(provenance.source, 'synthetic local complete record; actual newly generated native proof');
  assert.equal(provenance.source_proof_encoding, 'canonical compact bare ExecutionProofEnvelopeV1');
  assert.equal(provenance.players, 2); assert.equal(provenance.physical_ticks, 6); assert.equal(provenance.accepted_through_tick, 12);
  for (const key of ['cryptographic_computation_verified', 'history_checked_against_supplied_record', 'record_mutation_rejections_passed']) assert.equal(provenance[key], true);
  for (const key of ['ledger_origin_authenticated', 'ledger_execution_performed', 'finalized_ledger_inclusion_verified', 'funded_settlement', 'full_race', 'profile_qualified', 'profile_activated', 'security_qualification', 'native_browser_parity_claimed']) assert.equal(provenance[key], false);
  assert.equal(provenance.entropy, 'test-only deterministic prover entropy');
  assert.equal(typeof provenance.executable_path, 'string'); assert.ok(Number.isSafeInteger(provenance.executable_bytes) && provenance.executable_bytes > 0); assert.match(provenance.executable_sha256, /^[0-9a-f]{64}$/);
  assert.ok(provenance.compiled_selected_sources.length > 0);
  for (const source of provenance.compiled_selected_sources) {
    assert.equal(typeof source.path, 'string'); assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0); assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(['stock-profile', 'exporter-or-model'].includes(source.role));
  }
  const names = ['proof.nrt', 'request.nrt', 'outcome.nrt', 'record.nrt', 'binding.nrt', 'fixtures.json', 'semantic-values.json'];
  assert.deepEqual(provenance.files.map(row => row.name), names);
  for (const row of provenance.files) {
    const raw = readFileSync(join(directory, row.name)); assert.equal(row.bytes, raw.length); assert.equal(row.sha256, sha256(raw));
  }
  const proof = readFileSync(join(directory, 'proof.nrt')), digest = sha256(proof);
  assert.equal(fixture.source_proof_file, 'proof.nrt'); assert.equal(provenance.source_proof_file, 'proof.nrt');
  assert.equal(fixture.source_proof_sha256, digest); assert.equal(provenance.source_proof_sha256, digest);
  assert.equal(fixture.network_id, provenance.network_id);
  assert.deepEqual(fixture.vectors.map(row => [row.name, row.case]), ['GameManifestV1', 'ExecutionProofEnvelopeV1', 'RaceProverRequestV1', 'GameOutcomeV1', 'RaceDnfEventV1', 'ExecutionRecordBindingV1', 'GameSessionRecordV1'].map(name => [name, 'fresh-native-proof-derived']));
  for (const row of fixture.vectors) {
    assert.deepEqual(Object.keys(row).sort(), ['case', 'encoded_hex', 'framed_hex', 'name', 'source_proof_sha256', 'value']);
    assert.equal(row.source_proof_sha256, digest); assert.match(row.encoded_hex, /^(?:[0-9A-F]{2})+$/); assert.match(row.framed_hex, /^(?:[0-9A-F]{2})+$/);
  }
  const rows = Object.fromEntries(fixture.vectors.map(row => [row.name, row]));
  for (const [name, path] of [['ExecutionProofEnvelopeV1', 'proof.nrt'], ['RaceProverRequestV1', 'request.nrt'], ['GameOutcomeV1', 'outcome.nrt'], ['GameSessionRecordV1', 'record.nrt'], ['ExecutionRecordBindingV1', 'binding.nrt']]) assert.equal(rows[name].encoded_hex, readFileSync(join(directory, path)).toString('hex').toUpperCase());
  const request = rows.RaceProverRequestV1.value, envelope = rows.ExecutionProofEnvelopeV1.value, record = rows.GameSessionRecordV1.value;
  assert.deepEqual(request.source_record, record); assert.deepEqual(rows.GameManifestV1.value, record.manifest);
  assert.deepEqual(rows.ExecutionRecordBindingV1.value, envelope.statement.source_record_binding);
  assert.equal(record.session_id, provenance.session_id); assert.equal(record.network_id, provenance.network_id); assert.equal(envelope.profile_id, provenance.profile_id);
  return fixture;
}
