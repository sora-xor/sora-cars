import { validateGameResourceClausesV1 } from '@iroha/iroha-js/game';
import type { GameResourceReservationClauseV1 } from '@iroha/iroha-js/game';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Readable rendering of exactly typed custody terms; it never chooses or authorizes equipment. */
export function equipmentTermsMarkup(authorized: readonly GameResourceReservationClauseV1[]): string {
  const resources = validateGameResourceClausesV1(authorized);
  const rows = resources.map(resource => `<div class="staked-item"><code>${escape(resource.nft_id)}</code><span>対戦終了時に元の所有者へ返却 <small class="english-subtitle" lang="en">RETURN TO ORIGINAL OWNER AT TERMINAL</small></span><details><summary>装備の承認内容 <small class="english-subtitle" lang="en">EQUIPMENT AUTHORIZATION</small></summary><p class="fine-print">メタデータ / METADATA <code>${escape(resource.expected_metadata_hash)}</code><br>役割 / ROLE <code>${escape(resource.role_id)}</code></p></details></div>`).join('');
  return `<section class="session-equipment"><h2>一時装備。<small class="english-subtitle" lang="en">TEMPORARY EQUIPMENT.</small></h2><p class="fine-print">装備は勝負品と別です。勝敗や失格にかかわらず、チェーンが対戦の終了を確定した時に元の所有者へ返ります。離脱だけでは返却されません。<span class="english-subtitle" lang="en">Equipment is separate from wagers. It returns to its original owner when the chain confirms a legal terminal transition, regardless of winning or forfeiting. Leaving the page does not release it.</span></p>${rows || '<p class="fine-print">この標準クラスでは装備を預けません。性能装備の専用クラスは認定待ちです。<small class="english-subtitle" lang="en">This stock class reserves no equipment. Performance classes await qualification.</small></p>'}</section>`;
}
