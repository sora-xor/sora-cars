import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeSourceRoot } from '../scripts/lib/native-source-root.mjs';
import { NATIVE_PROFILE_SOURCES } from '../scripts/lib/native-sources.mjs';
import { CLASSED_NATIVE_PROFILE_SOURCES } from '../scripts/lib/classed-native-sources.mjs';

// This reads source only. It neither runs a native executable nor substitutes
// executable-authored paths for the generator's closed local inventory.
async function compiledPaths(relative: string, constant: string): Promise<string[]> {
  const text = await readFile(join(nativeSourceRoot(), relative), 'utf8');
  const marker = `const ${constant}: &[(&str, &[u8])] = &[`;
  assert.equal(text.split(marker).length, 2, `one declared ${constant}`);
  const body = text.split(marker)[1]!.split('\n];')[0]!;
  const paths = [...body.matchAll(/^\s*"(crates\/[^"\n]+)",/gm)].map(match => match[1]!);
  assert.ok(paths.length > 0);
  assert.equal(new Set(paths).size, paths.length, 'native profile paths are unique');
  return paths;
}

test('Stock generation catalog matches every native committed source in order', async () => {
  assert.deepEqual([...NATIVE_PROFILE_SOURCES], await compiledPaths('crates/iroha_core/src/execution_proofs/proof.rs', 'RACE_PROFILE_SOURCES_V1'));
});

test('Touring generation catalog matches every native committed source in order', async () => {
  assert.deepEqual([...CLASSED_NATIVE_PROFILE_SOURCES], await compiledPaths('crates/iroha_core/src/execution_proofs/classed_race_v1/proof.rs', 'CLASSED_RACE_PROFILE_SOURCES_V1'));
});

// The resource bounds are part of accepted-history admission even when the
// simulator source and arithmetic constraints are unchanged.
test('every generated game profile commits the retention admission implementation', () => {
  const path = 'crates/iroha_data_model/src/game_retention.rs';
  assert.ok(NATIVE_PROFILE_SOURCES.includes(path));
  assert.ok(CLASSED_NATIVE_PROFILE_SOURCES.includes(path));
});
