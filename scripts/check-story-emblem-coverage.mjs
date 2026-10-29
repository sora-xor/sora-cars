// Run with node --import tsx scripts/check-story-emblem-coverage.mjs.
// This verifies the identity of human-reviewed artwork, not logo recognition.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CHAPTERS, RETRY_SCENE } from '../src/game/story.ts';
import { STORY_SCENES, STORY_ANGLE_ART, STORY_BEAT_ART, resolveStoryFrame } from '../src/game/story-scenes.ts';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'src/game/story-scenes.ts', 'src/game/story-cut-art.json', 'src/game/story.ts',
  ...[1, 2, 3].map(n => `src/game/story-campaign-act${n}.ts`),
];
const snapshot = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha256(await readFile(path))])));
const before = await snapshot();
const reference = 'public/assets/branding/sora-emblem-source.png';
const expectedReferenceHash = '4c9202c9a44065856dc6d954e8afd6a99787b3a45c1ebad8c31a655e75260a69';
const referenceMatches = sha256(await readFile(reference)) === expectedReferenceHash;
const auditPaths = [
  'artifacts/story-emblem-audit-2026-09-26.json',
  'artifacts/story-opening-emblem-audit-2026-09-26.json',
  'artifacts/story-per-cut-emblem-audit-2026-09-26.json',
  'artifacts/story-expanded-emblem-audit-2026-09-26.json',
  'artifacts/story-office-emblem-audit-2026-10-29.json',
  'artifacts/story-street-chapters-emblem-audit-2026-10-29.json',
];
const audited = new Map();
const evidence = [];
for (const path of auditPaths) {
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const audit = JSON.parse(bytes);
  evidence.push({ path, sha256: sha256(bytes) });
  if (audit.passed !== true || !Array.isArray(audit.files)) continue;
  for (const file of audit.files) {
    if (file.hasRecognizableReferenceGeometry === true && /^[a-f0-9]{64}$/.test(file.sha256)) {
      audited.set(`${file.path}:${file.sha256}`, path);
    }
  }
}
const usage = new Map();
function include(art, context) {
  const path = `public/assets/story/${art}`;
  if (!usage.has(path)) usage.set(path, []);
  usage.get(path).push(context);
}
for (const [id, scene] of Object.entries(STORY_SCENES)) include(scene.art, `location:${id}`);
for (const [id, shots] of Object.entries(STORY_ANGLE_ART)) {
  for (const [shot, art] of Object.entries(shots)) include(art, `fallback:${id}/${shot}`);
}
for (const [id, art] of Object.entries(STORY_BEAT_ART)) include(art, `beat:${id}`);
const sequences = CHAPTERS.flatMap(chapter => {
  include(chapter.art, `chapter-menu:${chapter.id + 1}`);
  return ['intro', 'victory'].map(phase => [`ch${String(chapter.id + 1).padStart(2, '0')}-${phase}`, chapter[phase]]);
});
sequences.push(['retry', RETRY_SCENE]);
for (const [sequence, lines] of sequences) {
  for (let line = 0; line < lines.length; line++) include(resolveStoryFrame(lines, line, sequence).art, `${sequence}:${line + 1}`);
}
const files = [];
for (const [path, contexts] of [...usage.entries()].sort()) {
  try {
    const hash = sha256(await readFile(path));
    const audit = audited.get(`${path}:${hash}`);
    files.push({ path, sha256: hash, contexts, reviewedCurrentBytes: Boolean(audit), ...(audit ? { audit } : { issue: 'Visual emblem review required for these exact bytes.' }) });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    files.push({ path, contexts, reviewedCurrentBytes: false, issue: 'Referenced artwork is missing.' });
  }
}
const after = await snapshot();
const sourcesUnchanged = JSON.stringify(before) === JSON.stringify(after);
const pending = files.filter(file => !file.reviewedCurrentBytes);
const passed = referenceMatches && sourcesUnchanged && pending.length === 0;
const report = {
  schema: 'sora-cars.story-emblem-coverage.v1', checkedAt: new Date().toISOString(), passed,
  scope: 'Current chapter/menu, scene, fallback-angle, story-beat and actual per-cut artwork references. Historical unused images and soundtrack covers are outside this report.',
  method: 'Resolve every authored line; require each referenced file to match a passed individual visual-review audit by path and SHA-256. This script does not recognize logos automatically.',
  reference, referenceMatches, evidence, sourcesUnchanged, sourceHashes: before, finalSourceHashes: after,
  total: files.length, reviewed: files.length - pending.length, pending: pending.map(file => file.path), files,
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/story-emblem-coverage-current.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`${passed ? 'PASS' : 'INCOMPLETE'}: ${report.reviewed}/${report.total} current story images have matching visual emblem reviews; ${pending.length} need review.`);
if (!passed) process.exitCode = 1;
