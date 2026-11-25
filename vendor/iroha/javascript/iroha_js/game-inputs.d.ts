/** Canonical public game inputs. game384/nonce32 literals are distinct from ledger hash literals. */
export interface GameActiveScopeV1 { manifest: string; admission: string }
export interface GameInputCommitmentV1 { session_id: string; scope: GameActiveScopeV1; epoch: string | number | bigint; start_tick: number; slot: number; commitment: string; signature: string }
export interface GameInputRevealV1 { session_id: string; scope: GameActiveScopeV1; epoch: string | number | bigint; start_tick: number; slot: number; payload: number[]; nonce: string }
export interface GameTranscriptV1 { batches: { start_tick: number; inputs: number[][] }[]; dnf_events: { tick: number; slots: number[] }[] }
