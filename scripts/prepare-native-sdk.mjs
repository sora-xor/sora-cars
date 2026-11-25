import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeBinding } from '../vendor/iroha/javascript/iroha_js/src/native.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const submodule = 'vendor/iroha-js-native';
const source = join(root, submodule);
const sdk = join(root, 'vendor/iroha/javascript/iroha_js');
const native = join(sdk, 'native');
const binding = join(native, 'iroha_js_host.node');
const manifestPath = join(native, 'iroha_js_host.checksums.json');

function output(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

const entry = output('git', ['ls-tree', 'HEAD', '--', submodule], root);
const pin = /^160000 commit ([a-f0-9]{40})\t/.exec(entry)?.[1];
if (!pin) throw new Error(`Missing committed native SDK source pin for ${submodule}.`);
if (process.env.IROHA_JS_NATIVE_DIR && resolve(process.env.IROHA_JS_NATIVE_DIR) !== native) {
  throw new Error('Unset IROHA_JS_NATIVE_DIR to test the committed SDK and its authenticated native addon.');
}

function matchesPin() {
  const verified = verifyNativeBinding(binding, { manifestPath });
  return verified.ok && verified.sourceTreeClean === true && verified.sourceGitRevision === pin;
}

if (matchesPin()) {
  console.log(`Using verified native SDK binding from ${pin}.`);
} else {
  if (!existsSync(join(source, '.git'))) {
    execFileSync('git', ['submodule', 'update', '--init', '--depth', '1', '--', submodule], { cwd: root, stdio: 'inherit' });
  }
  if (output('git', ['rev-parse', 'HEAD'], source) !== pin || output('git', ['status', '--porcelain'], source)) {
    throw new Error(`Native SDK build requires a clean ${submodule} at ${pin}.`);
  }

  const toolchain = '1.93.1'; // Required by the pinned upstream provenance verifier.
  const tool = name => output('rustup', ['which', '--toolchain', toolchain, name], source);
  const cargo = tool('cargo'), rustc = tool('rustc');
  const host = /^host: (\S+)$/m.exec(output(rustc, ['-vV'], source))?.[1];
  if (!host) throw new Error('Could not determine the native Cargo target.');
  execFileSync(cargo, ['fetch', '--locked', '--target', host], { cwd: source, stdio: 'inherit' });

  // The upstream builder authenticates the live tree and requires this locked,
  // offline, serialized Cargo profile. Give it only the host/tool lookup context.
  const hostKeys = ['HOME', 'PATH', 'USER', 'LOGNAME', 'TMPDIR', 'SHELL', 'LANG', 'LC_ALL', 'CARGO_HOME', 'RUSTUP_HOME', 'SDKROOT', 'DEVELOPER_DIR', 'SystemRoot', 'USERPROFILE', 'TEMP', 'TMP', 'PATHEXT', 'INCLUDE', 'LIB', 'LIBPATH'];
  const env = Object.fromEntries(hostKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, {
    IROHA_JS_CARGO_PATH: cargo, RUSTC: rustc, RUSTDOC: tool('rustdoc'),
    IROHA_JS_CARGO_LOCKFILE_PATH: join(source, 'Cargo.lock'),
    CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? join(root, 'output/build/iroha-js-native'),
    CARGO_BUILD_JOBS: '1', CARGO_INCREMENTAL: '0', CARGO_NET_OFFLINE: 'true', RUSTC_BOOTSTRAP: '1',
    IROHA_JS_NATIVE_DIR: native,
  });
  for (const script of ['build-native.mjs', 'copy-native.mjs']) {
    execFileSync(process.execPath, [join(source, 'javascript/iroha_js/scripts', script)], { cwd: source, env, stdio: 'inherit' });
  }
  if (!matchesPin()) throw new Error(`Native SDK publication did not verify against ${pin}.`);
}
