export interface CurrentGameWireCorpus {
  schema: string; version: 1; network_id: string;
  vectors: { name: string; case: string; value: any; encoded_hex: string; framed_hex: string; type_name: string; wire_id: string | null; instruction_archive_hex: string | null; instruction_framed_hex: string | null }[];
}
export function currentGameFixtures(): CurrentGameWireCorpus;
export interface CurrentGameProofCorpus {
  schema: string; version: 1; network_id: string; source_proof_file: "proof.nrt"; source_proof_sha256: string;
  vectors: { name: string; case: string; value: any; encoded_hex: string; framed_hex: string; source_proof_sha256: string }[];
}
export function currentGameProofFixtures(): CurrentGameProofCorpus;
