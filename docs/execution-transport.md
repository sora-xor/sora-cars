# Complete execution-proof transactions

Execution proofs remain inside canonical typed `VerifyExecutionProofV1` and `SettleGameSessionV1` payloads. The transport never substitutes a URL or asks a relay to approve a result. The browser constructs and validates the transaction locally, the wallet approves its explicit fee limit, and consensus independently verifies the statement and settlement.

The SDK permits a payload above its ordinary one MiB limit only when it contains exactly one of these two canonical execution instructions, with a four MiB maximum. Mixed oversized batches and unrelated executable types are rejected. The compiled race adapter uses at most three MiB for STARK bytes and four MiB for the complete canonical proof envelope.

Connect uses its existing authenticated encrypted `SignRequestTx` message. A complete browser transaction adds 216 bytes of current V1 framing and authenticated encryption overhead. The SDK's `validateConnectTransactionTransportStatus` checks the endpoint's advertised WebSocket and retained session limits before sending a large request. This is a capacity hint; it does not prove wallet interoperability or authenticate the endpoint.

Native Connect P2P messages have a dedicated reliable, low-priority `Connect` topic and separate `network.max_frame_bytes_connect` setting. Health traffic retains its own existing bound. Connect continues to use the bounded other-traffic queue and shared source-credit accounting. Transaction gossip keeps its existing batching and priority behavior, with an explicitly configured larger frame cap on execution-capable deployments.

The opt-in Iroha overlay `configs/soranexus/execution-proof-transport.toml` supplies these settings for a reviewed complete runtime configuration:

| Capacity | Ordinary configuration | Execution overlay |
| --- | ---: | ---: |
| Connect WebSocket frame/message | 64,000 bytes | 4 MiB + 4,096 bytes |
| Connect retained session buffer | 256 KiB | 8 MiB |
| Dedicated Connect P2P frame | 128 KiB | 8 MiB |
| Transaction gossip frame | 256 KiB | 8 MiB |
| Health P2P frame | 32 KiB | 32 KiB |

The overlay limits concurrent Connect sessions to 16 and sessions per IP to eight. It does not register or qualify an execution profile and is not a complete node configuration. Operators must apply compatible limits across every participating peer, reverse proxy and wallet transport. Swift wallet integrations can explicitly select `ConnectWebSocketFactory.urlSessionForExecutionProofs()` to set the same bounded message limit; ordinary factories retain their platform defaults. The current whole-message protocol does not provide application-level fragmentation negotiation.

`/v1/games/capabilities.execution_transport_ready` reports whether the serving node's actual Connect, P2P, Torii body and canonical transaction bounds cover this corridor. The browser requires that hint and the exact release-pinned qualified proof profile before allowing new stakes. Missing or malformed readiness values fail closed. Transport readiness is never a consensus instruction condition; validators must reach the same settlement result regardless of their local transport configuration. Recovery actions for an existing game remain available.

Validation includes browser encryption/decryption of a complete four MiB request, ordinary/default rejection, bounded worker transport of multi-MiB proof files, and native source tests for signed Connect approval followed by complete large frame relay. The native test's ciphertext is opaque relay data; it is not a wallet transaction approval. Native compilation, actual wallet sign/submit, multi-peer gossip, restart/replay and four-validator state-root agreement remain required qualification evidence. Do not infer live compatibility from these unit tests or the readiness hint.
