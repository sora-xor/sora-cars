import type { Livery } from './rules';

export interface ClubItem {
  sku: string; kind: 'skin' | 'upgrade'; designer: string;
  name: { ja: string; en: string }; story: { ja: string; en: string };
  color: string; dark: string; light: string; accent: string;
  pattern: 'sunrise' | 'signal' | 'sakura' | 'wave' | 'grid' | 'pulse';
}
/** Presentation-only designs. None changes the frozen RaceV1 arithmetic. */
export const CLUB_ITEMS: readonly ClubItem[] = [
  { sku: 'aki-first-light', kind: 'skin', designer: '空本アキ', name: { ja: 'はじまりの朝焼け', en: 'FIRST LIGHT' }, story: { ja: '父の車庫で塗った、最初の一台。SORAの朝日は、みんなの道を照らす。', en: 'Painted in her father’s garage. A SORA sunrise for every road ahead.' }, color: '#f2b56a', dark: '#bc5a55', light: '#ffdf9a', accent: '#d72a43', pattern: 'sunrise' },
  { sku: 'ren-radio-night', kind: 'skin', designer: '空井レン', name: { ja: '真夜中の周波数', en: 'MIDNIGHT FREQUENCY' }, story: { ja: 'ラジオの向こうに、まだ知らない仲間がいる。今夜もSORAから送信中。', en: 'Somewhere beyond the radio dial, a new friend is listening. SORA is on air.' }, color: '#453e7e', dark: '#25264e', light: '#8589d5', accent: '#f8b77e', pattern: 'signal' },
  { sku: 'mei-sakura-film', kind: 'skin', designer: '天羽メイ', name: { ja: '桜色のフィルム', en: 'SAKURA FILM' }, story: { ja: 'この一瞬を、忘れないように。桜とヘッドライトを一枚の写真に。', en: 'A photograph of blossoms and headlights, so this moment never fades.' }, color: '#f2a8c1', dark: '#a95587', light: '#ffd8dd', accent: '#fff0ae', pattern: 'sakura' },
  { sku: 'daichi-harbor-line', kind: 'skin', designer: '雲野ダイチ', name: { ja: '港の水平線', en: 'HARBOR HORIZON' }, story: { ja: '荷物を届けたら、海まで走ろう。青いラインは、自由時間の合図。', en: 'Delivery done. Let’s drive to the sea. A blue line means the evening is ours.' }, color: '#7bcfc7', dark: '#337e94', light: '#c2efe2', accent: '#f6efba', pattern: 'wave' },
  { sku: 'yui-solar-grid', kind: 'skin', designer: '空木ユイ', name: { ja: '太陽の設計図', en: 'SOLAR BLUEPRINT' }, story: { ja: 'いつか、太陽で動く車庫を。未来への設計図をSORAのボディに描いた。', en: 'One day, a garage powered by the sun. A blueprint for tomorrow on a SORA body.' }, color: '#dce28a', dark: '#879d62', light: '#f8f5ba', accent: '#328c8d', pattern: 'grid' },
  { sku: 'jun-transistor', kind: 'skin', designer: '天野ジュン', name: { ja: 'トランジスタの夢', en: 'TRANSISTOR DREAM' }, story: { ja: '壊れたシンセにも、次の音がある。SORAの夜を彩る、四角いリズム。', en: 'Even a broken synthesizer has another song in it. Square-wave rhythms for a SORA night.' }, color: '#727ddd', dark: '#3e3c86', light: '#b1b4ff', accent: '#eca6d9', pattern: 'pulse' },
  { sku: 'club-aero-86', kind: 'upgrade', designer: '空本アキ × 空木ユイ', name: { ja: 'クラブ・エアロ86', en: 'CLUB AERO 86' }, story: { ja: '車庫のみんなで作った、少し大げさなウイング。見た目を変える専用パーツ。', en: 'An exuberant wing built together at the garage. A visual body-kit upgrade.' }, color: '#f0e9dc', dark: '#9697a4', light: '#fff', accent: '#e63445', pattern: 'grid' },
  { sku: 'club-neon-pulse', kind: 'upgrade', designer: '天野ジュン', name: { ja: 'ネオン・パルス', en: 'NEON PULSE' }, story: { ja: 'ブーストの炎に、シンセの色を。速度はそのまま、夜をもっと鮮やかに。', en: 'Synthesizer colors in the boost flames. The same speed, a brighter night.' }, color: '#9672df', dark: '#4d367e', light: '#c6acff', accent: '#ffa2d9', pattern: 'pulse' },
];
export interface ClubAppearance { skin: string | null; upgrade: string | null }
export const emptyAppearance = (): ClubAppearance => ({ skin: null, upgrade: null });
export const clubItem = (sku: string | null | undefined) => CLUB_ITEMS.find(item => item.sku === sku);
export function validateClubAppearance(value: unknown): ClubAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'skin,upgrade') throw new Error('Invalid cosmetic appearance.');
  const v = value as ClubAppearance;
  for (const field of ['skin', 'upgrade'] as const) if (v[field] !== null && (typeof v[field] !== 'string' || clubItem(v[field])?.kind !== field)) throw new Error('Unknown cosmetic design.');
  return { skin: v.skin, upgrade: v.upgrade };
}
export function clubLivery(base: Livery, appearance?: ClubAppearance): Livery {
  const skin = clubItem(appearance?.skin);
  return skin?.kind === 'skin' ? { ...base, color: skin.color, dark: skin.dark, light: skin.light, name: skin.name.en, japanese: skin.name.ja } : base;
}
export function clubItemMetadata(item: ClubItem, applicationId: string) {
  return { sora_cars: { version: 1, application_id: applicationId, sku: item.sku, kind: item.kind }, name: item.name.ja, subtitle: item.name.en, designer: item.designer, description: item.story.ja, description_en: item.story.en, performance: 'RaceV1 unchanged' };
}
