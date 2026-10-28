import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  STREET_LAYOUT_SOURCE, STREET_LAYOUT_COPY, STREET_LAYOUT_BROWSER, STREET_LAYOUT_METADATA,
  readNativeStreetLayout, streetLayoutArtifacts, verifyStreetLayout,
} from './lib/street-layout-source.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (key === '--check') {
    if (options.check) throw new Error('Duplicate --check.');
    options.check = true;
  } else if (key === '--iroha-root' || key === '--output') {
    if (options[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid ${key}.`);
    options[key] = args[++i];
  } else throw new Error(`Unknown argument ${key}.`);
}
const selectedRoot = options['--iroha-root'] ?? process.env.SORA_CARS_IROHA_ROOT;
if (options.check) {
  if (options['--output']) throw new Error('--check does not write an evidence lane.');
  const checked = await verifyStreetLayout(selectedRoot);
  console.log(JSON.stringify({ checked: true, ...checked.metadata }));
} else {
  if (!options['--output']) throw new Error('Use --output with a fresh evidence directory; historical evidence is never overwritten.');
  const native = await readNativeStreetLayout(selectedRoot);
  const artifacts = streetLayoutArtifacts(native.bytes);
  const out = resolve(ROOT, options['--output']);
  const outputRelative = relative(resolve(ROOT, 'output'), out);
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) throw new Error('Evidence output must be a new child directory of output/.');
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const sourceNames = ['scripts/generate-street-layout.mjs', 'scripts/lib/street-layout-source.mjs', 'scripts/lib/street-layout-source.d.mts'];
  const sources = Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, sha256(await readFile(resolve(ROOT, name)))])));
  const commit = execFileSync('git', ['-C', native.root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid selected native checkout identity.');
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // create-new evidence, before touching generated consumers
  const frozenSource = resolve(out, 'source', STREET_LAYOUT_SOURCE);
  await mkdir(dirname(frozenSource), { recursive: true });
  await writeFile(frozenSource, native.bytes, { flag: 'wx' });
  for (const [name, bytes] of [
    [STREET_LAYOUT_COPY, native.bytes],
    [STREET_LAYOUT_BROWSER, artifacts.browser],
    [STREET_LAYOUT_METADATA, artifacts.metadataBytes],
  ]) {
    const target = resolve(ROOT, name), temporary = `${target}.generating-${process.pid}`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx' });
    try { await rename(temporary, target); } finally { await rm(temporary, { force: true }); }
  }
  await verifyStreetLayout(native.root);
  for (const [name, expected] of Object.entries(sources)) {
    if (sha256(await readFile(resolve(ROOT, name))) !== expected) throw new Error(`Generator changed: ${name}`);
  }
  const report = {
    schema: 'sora-cars.native-street-layout-generation.v1',
    sources,
    physicalSource: { root: native.root, head: commit, sourceKey: STREET_LAYOUT_SOURCE, sha256: sha256(native.bytes), bytes: native.bytes.length },
    generated: artifacts.metadata,
    builds: 0,
    scope: 'Byte-exact native layout copy and derived browser metadata; no native compilation, profile registration or proof qualification.',
  };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ report: relative(ROOT, resolve(out, 'report.json')), ...report }));
}
