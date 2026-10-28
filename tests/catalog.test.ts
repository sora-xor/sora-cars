import { admissionCommitment } from '../src/chain/certificates.ts';
import { currentGameFixtures } from '../scripts/lib/current-game-fixtures.mjs';
import { releaseClubCatalog } from '../src/chain/catalog';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_ITEMS, clubItemMetadata, clubLivery } from '../src/game/catalog';
import { resolveGarageNft } from '../src/chain/inventory';
import { parseItemStakes, stakeRaceItem } from '../src/chain/races';
import { LIVERIES } from '../src/game/rules';
const f = currentGameFixtures();
const v = (name: string) => f.vectors.find((v: {name: string}) => v.name === name)!.value;
const open = v('OpenGameSessionV1'), body = v('GameAdmissionBodyV1');
test('release catalog binds every original cosmetic to native metadata without changing driving fields', () => {
  const catalog = releaseClubCatalog(JSON.stringify({ domain: 'sora_cars.universal', sellers: [body.participants[0].account] }), open.manifest.application_id, open.asset_definition)!;
  assert.equal(catalog.items.length, 8);
  for (const item of CLUB_ITEMS) {
    const nft = { id: `${item.sku}$${catalog.domain}`, ownedBy: body.participants[0].account, metadata: clubItemMetadata(item, catalog.applicationId) };
    assert.equal(resolveGarageNft(nft, catalog)?.sku, item.sku);
    assert.equal(resolveGarageNft({ ...nft, metadata: { ...nft.metadata, price: 0 } }, catalog), null);
    assert.equal(clubLivery(LIVERIES[0]!, { skin: item.sku, upgrade: null }).id, 0);
    assert.match(item.name.ja, /[\u3040-\u30ff\u4e00-\u9fff]/); assert.ok(item.name.en && item.story.en);
  }
  assert.equal(releaseClubCatalog(undefined, undefined, undefined), undefined);
  assert.throws(() => releaseClubCatalog('{"domain":"x.y","sellers":[],"url":"https://invalid"}', open.manifest.application_id, open.asset_definition));
});
test('wagers enter the exact immutable admission commitment and reject partial transfer records', () => {
  // The native row is transport-only (unclaimed with a recipient). Retained stakes set both atomically at settlement.
  const sample = v('GameItemStakeV1'), item = { ...sample, recipient: null, claimed: false };
  assert.equal(f.vectors.find((v: {name: string}) => v.name === 'GameItemStakeV1')!.case, 'synthetic-transport-only');
  assert.equal(parseItemStakes([item], 1)[0]!.nft_id, item.nft_id);
  assert.equal(parseItemStakes([{ ...item, recipient: sample.recipient, claimed: true }], 1)[0]!.recipient, sample.recipient);
  assert.throws(() => parseItemStakes([sample], 1));
  assert.throws(() => parseItemStakes([item, { ...item, slot: 1 }], 2));
  assert.throws(() => parseItemStakes([{ ...item, claimed: true }], 1));
  const session = open.session_id;
  const hash = admissionCommitment(f.network_id, session, body);
  assert.equal(hash, v('GameActiveScopeV1').admission);
  assert.throws(() => admissionCommitment(f.network_id, session, { ...body, participants: body.participants.map((p: object) => ({ ...p, dnf_at_tick: 120 })) }));
  assert.notEqual(hash, admissionCommitment(f.network_id, session, { ...body, wagers: [{ ...body.wagers[0], nft_id: 'different$sora_cars.universal' }] }));
  assert.notEqual(hash, admissionCommitment(f.network_id, session, { ...body, wagers: [] }));
  assert.notEqual(hash, admissionCommitment(f.network_id, session, { ...body, resources: [] }));
  assert.deepEqual(stakeRaceItem(session, item.nft_id, v('StakeGameItemV1').expected_manifest_commitment), { StakeGameItemV1: v('StakeGameItemV1') });
});
