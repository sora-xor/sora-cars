# SORA Custom Works

The garage has six crew-designed NFT liveries and two visual upgrades. The six standard color variants remain free and equal-performance. These designs only affect rendering. Performance upgrades require a separate reviewed computation/class; they do not silently change RaceV1.

Japanese names, designer backstories and descriptions are primary; English subtitles stay visible. All images and metadata used for presentation are bundled with the site. Remote NFT metadata cannot inject images, executable code or physics.

## Release collection

Set `VITE_NFT_COLLECTION` to a reviewed build-time JSON object containing exactly `domain` and `sellers`. Pin `VITE_GAME_APPLICATION_ID` and `VITE_XOR_ASSET_DEFINITION` from the reviewed network context. The application computes each allowed native Norito metadata hash from the exact local `clubItemMetadata` definition. Extra metadata, another application/domain or an unknown SKU does not confer a garage item.

`npm run assets:catalog -- <application-hash> <XOR-definition> '<collection-JSON>' <output.json>` exports the exact metadata and content hashes for native collection issuance. It does not mint NFTs or create offers. No default account, collection or price is invented.

The native sale offer fixes its complete network, NFT, seller, payment asset, price, metadata hash, expiry and optional reserved buyer. Checkout refetches the same immutable offer and protected NFT custody before constructing a local `BuyNftV1` transaction. Price and wallet-approved maximum fees are separate. The market requires both a reviewed local release (`VITE_NFT_MARKET_QUALIFIED`, exact `VITE_NFT_MARKET_PROFILE_ID`) and matching qualified native capability. A working HTTP endpoint is insufficient.

The review dialog holds a detached, frozen quote, wallet/client identity, fee asset
and its own fee input. A background listing refresh cannot replace those approved
terms. Confirmation consumes that snapshot once; closing or replacing the dialog,
changing wallets or changing clients invalidates it. Native purchase still
rechecks the exact offer against ledger state.

Owned-item queries and resulting UI are explicitly endpoint-reported. Equipping refetches ownership; a failed read, changed wallet or lost ownership clears the appearance. This is cosmetic presentation, not an independently authenticated NFT ownership verdict. Native transfers and purchases enforce actual ownership.

## Explicit session stakes

The optional NFT picker defaults to no item. Every join signs mandatory `expected_manifest_hash`, `expected_asset_definition` and `expected_stake` terms; native execution must match them against the immutable session before changing balances or reserves. An endpoint showing a lower stake cannot cause a larger debit from that approval. These preconditions are required even when no NFT is selected, with no legacy unbounded-join fallback.

Joining with an item signs one canonical transaction containing `JoinGameSessionV1` then `StakeGameItemV1`, bound to the same session and the same expected immutable manifest hash. Fresh ownership is checked before the wallet signs. The native transaction either deposits both the exact XOR entry stake and the selected NFT or rolls back both.

V1 supports one explicitly deposited NFT per permanent participant slot. All deposited items transfer atomically to a sole winner. Ties, all-forfeit outcomes and unstarted cancellation return each indivisible NFT to its original participant. No other wallet item can be taken. The session screen lists exact NFT IDs, original slots, custody state and completed recipients.

Items are separate consensus session state. Nonempty item sets enter a domain-separated starting roster commitment; empty-item sessions retain the existing commitment bytes. Later forfeits and transfer completion fields normalize to their starting values. The proof binds this commitment without altering frozen RaceV1 fields. Native settlement and snapshot restoration rederive it.

## Evidence and remaining qualification

`tests/catalog.test.ts` checks exact local content binding, unchanged livery physics identity, item ordering/uniqueness and normalized roster commitment. Shared native/SDK vectors cover item payloads and both roster tuple encodings. `npm run test:shop` inspects desktop/mobile Japanese content, exact prices/fees, blocked unqualified checkout and ownership loss. Its wallet/ledger transport is explicitly mocked; native codecs and metadata checks are real.

Native reserve, purchase and session item tests, real wallet interoperability, reviewed issuance, finality and Taira rollout remain required. Cosmetic choices are now signed with the session input key, sent across peer connections and the public spectator feed, and retained in local replay presentation metadata. A choice cannot change within the current peer session. These signatures authenticate the rendering choice, not NFT ownership, and are excluded from the native physics/proof transcript. Unknown designs and cross-session, forged or altered packets are rejected. Each racer's car build ([period cars](period-cars.md)) travels the same way in its own signed packet. Native transfers still enforce actual NFT ownership. This document does not claim live purchases, NFT rewards or deployment.
