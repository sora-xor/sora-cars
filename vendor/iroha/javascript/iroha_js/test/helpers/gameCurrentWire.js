import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Closed native exporter inventory. Archive parity is mandatory for every ISI,
// regardless of the metadata claimed by a row or its recomputed corpus digest.
const nativeInstructionNames = new Set([
  "OpenGameSessionV1", "JoinGameSessionV1", "StartGameSessionV1", "CommitGameCheckpointV1",
  "ChallengeGameSessionV1", "CommitGameInputsV1", "RevealGameInputsV1", "AdvanceGameDeadlineV1",
  "SettleGameSessionV1", "ExpireGameSessionV1", "ClaimGamePayoutV1", "StakeGameItemV1",
  "RegisterExecutionProofProfileV1", "VerifyExecutionProofV1",
]);

/** Test-only metadata gate; native payload/archive bytes are compared separately. */
export function assertCurrentGameWireArchiveMetadata(row) {
  if (nativeInstructionNames.has(row.name)) {
    assert.equal(row.wire_id, `iroha.instruction.v1::game::${row.name}`);
    assert.match(row.instruction_archive_hex, /^(?:[0-9A-F]{2})+$/);
    assert.match(row.instruction_framed_hex, /^(?:[0-9A-F]{2})+$/);
  } else {
    assert.equal(row.wire_id, null);
    assert.equal(row.instruction_archive_hex, null);
    assert.equal(row.instruction_framed_hex, null);
  }
}

/** Required Rust export; absence is a failing gate, never a synthetic fallback. */
export function loadCurrentGameWireCorpus() {
  const dir = process.env.SORA_CARS_GAME_CURRENT_WIRE_CORPUS ?? fileURLToPath(new URL("../fixtures/game_current_wire_v1", import.meta.url));
  const raw = readFileSync(resolve(dir, "fixtures.json"));
  const provenance = JSON.parse(readFileSync(resolve(dir, "provenance.json"), "utf8"));
  assert.equal(provenance.schema, "iroha.game.current-wire.provenance.v1");
  assert.equal(provenance.exporter_test, "export_canonical_game_wire_fixtures_from_semantic_seed");
  assert.equal(provenance.test_only, true);
  assert.equal(provenance.fixture_source, "compiled typed semantic constructors; no browser expected bytes");
  assert.ok(Array.isArray(provenance.compiled_selected_sources) && provenance.compiled_selected_sources.length > 0);
  for (const source of provenance.compiled_selected_sources) {
    assert.equal(typeof source.path, "string");
    assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0);
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(provenance.profile_activated, false);
  assert.equal(provenance.security_qualification, false);
  assert.equal(provenance.native_parity_claimed, false);
  assert.equal(provenance.files.length, 1);
  assert.equal(provenance.files[0].name, "fixtures.json");
  assert.equal(provenance.files[0].bytes, raw.length);
  assert.equal(provenance.files[0].sha256, createHash("sha256").update(raw).digest("hex"));
  assert.match(provenance.executable_sha256, /^[0-9a-f]{64}$/);
  const fixture = JSON.parse(raw);
  assert.equal(fixture.schema, "iroha.game.current-wire.v1");
  assert.equal(fixture.version, 1);
  assert.ok(Array.isArray(fixture.vectors));
  assert.deepEqual(fixture.vectors.map(row => [row.name, row.case]), [["GameCommitmentV1", "raw48-even-last-byte"], ["GameNonceV1", "raw32-even-last-byte"], ["GameActiveScopeV1", "computed"], ["GameManifestV1", "synthetic-transport-only"], ["GameAdmissionBodyV1", "wager-resource"], ["GameAdmissionBodyV1", "empty-cancellation"], ["GameCheckpointV1", "synthetic-transport-only"], ["SignedGameCheckpointV1", "synthetic-transport-only"], ["GameCommitmentSetV1", "synthetic-transport-only"], ["GameInputCommitmentV1", "synthetic-transport-only"], ["GameInputRevealV1", "synthetic-transport-only"], ["GameTranscriptV1", "synthetic-transport-only"], ["GameSessionRecordV1", "active"], ["GameSessionRecordV1", "lobby-none-admission"], ["GameOutcomeV1", "opaque"], ["GameOutcomeV1", "economic"], ["GamePayoutClaimV1", "synthetic-transport-only"], ["GameItemStakeV1", "synthetic-transport-only"], ["GameReplayEvidenceV1", "synthetic-transport-only"], ["ExecutionRecordBindingV1", "synthetic-transport-only"], ["ExecutionPublicInputsV1", "synthetic-transport-only"], ["ExecutionProofEnvelopeV1", "synthetic-transport-only"], ["RaceProverRequestV1", "synthetic-transport-only"], ["RaceProofPayloadV1", "synthetic-transport-only"], ["RaceResultV1", "synthetic-transport-only"], ["RaceStandingV1", "synthetic-transport-only"], ["RaceDnfEventV1", "synthetic-transport-only"], ["RaceSettlementResultV1", "late-economic-forfeit"], ["RaceSettlementStandingV1", "late-economic-forfeit"], ["OpenGameSessionV1", "synthetic-transport-only"], ["JoinGameSessionV1", "synthetic-transport-only"], ["StartGameSessionV1", "synthetic-transport-only"], ["CommitGameCheckpointV1", "synthetic-transport-only"], ["ChallengeGameSessionV1", "synthetic-transport-only"], ["CommitGameInputsV1", "synthetic-transport-only"], ["RevealGameInputsV1", "synthetic-transport-only"], ["AdvanceGameDeadlineV1", "synthetic-transport-only"], ["SettleGameSessionV1", "synthetic-transport-only"], ["ExpireGameSessionV1", "synthetic-transport-only"], ["ClaimGamePayoutV1", "synthetic-transport-only"], ["StakeGameItemV1", "synthetic-transport-only"], ["RegisterExecutionProofProfileV1", "synthetic-transport-only"], ["VerifyExecutionProofV1", "synthetic-transport-only"]]);
  const keys = fixture.vectors.map(row => JSON.stringify([row.name, row.case]));
  assert.equal(new Set(keys).size, keys.length, "unique native semantic cases");
  for (const row of fixture.vectors) {
    assert.deepEqual(Object.keys(row).sort(), ["case", "encoded_hex", "framed_hex", "instruction_archive_hex", "instruction_framed_hex", "name", "type_name", "value", "wire_id"]);
    assert.equal(typeof row.type_name, "string");
    assert.match(row.encoded_hex, /^(?:[0-9A-F]{2})+$/);
    assert.match(row.framed_hex, /^(?:[0-9A-F]{2})+$/);
    for (const retired of ["domain", "gameplay_digest_hex", "source_proof_sha256"]) assert.equal(Object.hasOwn(row, retired), false);
    assert.notEqual(row.case, "fresh-native-proof-derived");
    assertCurrentGameWireArchiveMetadata(row);
  }
  return fixture;
}
/** Separate fresh native proof evidence is required; semantic codec rows cannot satisfy this gate. */
export function loadCurrentGameProofCorpus() {
  const file = process.env.SORA_CARS_GAME_CURRENT_PROOF_CORPUS ?? fileURLToPath(new URL("../fixtures/game_current_proof_v1/fixtures.json", import.meta.url));
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(fixture.schema, "iroha.game.current-proof.v1");
  assert.equal(fixture.version, 1);
  return fixture;
}
