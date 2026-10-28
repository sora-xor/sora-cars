import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

type Bilingual = { ja: string; en: string };
type Entry = { code: string; prefecture: Bilingual; proposedTitle: Bilingual; corridor: Bilingual; geography: Bilingual; periodNotes: Bilingual;
  excludedModernLandmarks: { ja: string; en: string; reason: Bilingual; sourceUrl: string }[];
  sources: { url: string; title: string; support: Bilingual }[]; remainingEvidence?: Bilingual;
  qualification: { historicalAlignment: false; geometry: false; playable: false } };
const files = ['world/research/japan-east-1986.json', 'world/research/japan-west-special-1986.json'];
const names = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const expected = [...names.map((_, i) => String(i + 1).padStart(2, '0')), 'pyongyang', 'moscow'];
const bilingual = (value: Bilingual) => { assert.ok(value && typeof value === 'object'); assert.deepEqual(Object.keys(value).sort(), ['en', 'ja']); for (const language of ['ja', 'en'] as const) assert.ok(typeof value[language] === 'string' && value[language].trim().length > 0); };
const url = (value: string) => { const parsed = new URL(value); assert.equal(parsed.protocol, 'https:'); assert.equal(parsed.username + parsed.password, ''); };
const entries: Entry[] = [], sources: { path: string; sha256: string }[] = [];
for (const path of files) {
  const bytes = await readFile(path), document = JSON.parse(bytes.toString('utf8'));
  assert.equal(document.version, 1); assert.equal(document.year, 1986); assert.equal(document.researchedAt, '2026-09-07'); bilingual(document.evidencePolicy);
  for (const entry of document.entries as Entry[]) {
    assert.deepEqual(Object.keys(entry).filter(key => key !== 'remainingEvidence').sort(), ['code','prefecture','proposedTitle','corridor','geography','periodNotes','excludedModernLandmarks','sources','qualification'].sort());
    for (const key of ['prefecture','proposedTitle','corridor','geography','periodNotes'] as const) bilingual(entry[key]);
    if (entry.remainingEvidence) bilingual(entry.remainingEvidence);
    assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0);
    for (const source of entry.sources) { assert.deepEqual(Object.keys(source).sort(), ['support','title','url']); url(source.url); assert.ok(source.title.trim()); bilingual(source.support); }
    assert.ok(Array.isArray(entry.excludedModernLandmarks));
    for (const excluded of entry.excludedModernLandmarks) {
      bilingual({ ja: excluded.ja, en: excluded.en }); bilingual(excluded.reason); url(excluded.sourceUrl);
      assert.ok(entry.sources.some(source => source.url === excluded.sourceUrl), `${entry.code}: exclusion must cite an included supporting source`);
    }
    assert.deepEqual(entry.qualification, { historicalAlignment: false, geometry: false, playable: false });
    entries.push(entry);
  }
  sources.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
assert.deepEqual(entries.map(entry => entry.code), expected, 'exactly47prefecturesplus2specials, no missing/duplicate entries');
for (let i = 0; i < 47; i++) assert.equal(entries[i]!.prefecture.ja, names[i]);
assert.equal(new Set(entries.map(entry => entry.corridor.en)).size, 49, 'distinct corridor proposals');
assert.equal(new Set(entries.map(entry => entry.proposedTitle.en)).size, 49, 'distinct titles');
const tokyo = entries.find(entry => entry.code === '13')!;
assert.match(tokyo.corridor.en, /Manaita/); assert.match(tokyo.corridor.en, /Yasukuni/); assert.match(tokyo.corridor.en, /Diet/);
assert.match(entries.find(entry => entry.code === 'pyongyang')!.periodNotes.en, /Kim Il Sung/);
assert.match(entries.find(entry => entry.code === 'moscow')!.periodNotes.en, /USSR/);
const directory = 'output/street-tracks'; await mkdir(directory, { recursive: true });
await writeFile(`${directory}/world-catalog.json`, JSON.stringify({ version: 1, year: 1986, sources, entries }, null, 2) + '\n');
const markdown = `# SORA CARS — 1986 route research index\n\n47都道府県と2特別遠征。以下は資料に基づく候補地・走路の設計案で、プレイ可能な49コースではありません。\n\nThese are49 distinct researched corridor proposals. Tokyo has an unqualified compiled authoring draft; the others still require geographic authoring. Every entry retains explicit missing historical/geometry/playability qualification. Source facts, proposed route order and later landmarks are separated in the two source catalogs.\n\nSources: [East](research/japan-east-1986.json), [West and specials](research/japan-west-special-1986.json). Regenerate/check with \`npx tsx scripts/check-world-catalog.ts\`.\n\n|Code|場所 / Place|コース案 / Proposed race|Sources|Authoring|\n|---|---|---|---:|---|\n${entries.map(e => `|${e.code}|${e.prefecture.ja} / ${e.prefecture.en}|${e.proposedTitle.ja} / ${e.proposedTitle.en}|${e.sources.length}|${e.code === '13' ? 'Tokyo draft only' : 'Pending'}|`).join('\n')}\n\nRoute topology is not assumed to be a loop: point-to-point candidates need sprint support before their actual road geometry can be compiled. No fabricated return leg, modern shortcut, pedestrian staircase or repeated reskin may stand in for the requested location.\n`;
await writeFile('world/catalog-1986.md', markdown);
console.log(`49 distinct locations, ${entries.reduce((n,e)=>n+e.sources.length,0)} source references, complete prefecture coverage. Historical geometry and playability remain unqualified.`);
