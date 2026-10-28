# Terminal computation and retained input history

Status: implemented in a private native integration candidate; funding remains unqualified. The browser boundary fix uses the existing Stock rule. The native candidate must pass its complete build, proof and consensus gates before activation.

The proof establishes the **earliest terminal batch boundary T**. The arithmetic relation rejects extending a replay past that boundary. Consensus can nevertheless record additional forced rounds while a proof is being generated because the generic game lifecycle does not execute the game's simulation.

The first-release rule is:

| Accepted history | Effect on the proved result |
| --- | --- |
| Driving controls before T | Must match the replay exactly. |
| Consensus removals before T | Apply before the corresponding driving tick. |
| Consensus removals at T | Apply before ranking, without another driving tick. |
| Driving controls at T or later | Retain and validate their canonical encoding, without executing them. |
| Consensus removals strictly after T | Retain as input-key inactivity history; do not change the proved awards. |

A visible finish alone does not fix eligibility: an accepted removal at the same boundary T still counts. The result becomes final through proved consensus settlement. A worker must rebuild the statement when the retained dispute commitment changes; a proof for older history cannot silently settle newer history.

The shared native `game_history` module checks the complete retained history through `next_tick`: batch bounds and order, exact epochs, checkpoint placement, input shapes, and a bijection between participant removal markers and forced-round removals. It verifies original-roster checkpoint signatures and immutable transcript anchors. A started session must retain its genesis or a later checkpoint. It keeps the generic lifecycle's cumulative input bound before history hashing.

The replay must cover all accepted inputs between the checkpoint and T. A pending commitment certificate cannot substitute for missing reveals or permit an earlier favorable replay. Checkpoint state represents the boundary **before** removals at that same tick. Each compiled application adapter separately checks the checkpoint state commitment and terminal flag; its arithmetic relation proves the state and earliest terminality.

The complete later tail remains inside the existing dispute-history commitment. Both unpublished Stock and Touring verifier inventories include the shared module, and both rules commitments include the explicit cutoff descriptor. These changes produce new immutable profile identities. Historical proofs do not qualify the new profiles.

XOR payouts and wagered NFT transfers use the proof's `winner_slots`. They must not re-filter those slots using later raw `dnf_at_tick` markers. Browser reconstruction likewise applies removals at T before stopping and omits driving beyond T. A round cannot begin at the maximum simulation tick: the native maximum is a bound on accepted rounds as well as the replay.

This rule authenticates accepted inputs, execution and awards. It does not prove human participation, continuous network connectivity, or ledger finality. Independent verification must authenticate the retained session against the pinned network's finalized ledger.
