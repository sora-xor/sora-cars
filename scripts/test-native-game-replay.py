#!/usr/bin/env python3
"""Qualify the current native retained-game replay route in a fresh evidence lane.

Run only after native source freeze. Reuses the isolated warm Cargo target and
Rust 1.93.1; never refreshes the SDK binding or promotes live-game qualification.
The retained producer starts from a synthetic zero-value prestate. Its native
signed deadline and real Kura/Torii export do not establish admitted lifecycle,
four-validator consensus, full-race proofs, funding, or deployment readiness.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT.parent / 'iroha-sora-cars-native'
TOOLCHAIN = Path('/Users/takemiyamakoto/.rustup/toolchains/1.93.1-aarch64-apple-darwin/bin')
TEST_DECLARATION = re.compile(r'#\[(?:tokio::)?test(?:\([^)]*\))?\]\s*(?:#\[[^\]]+\]\s*)*(?:async\s+)?fn\s+(\w+)')
PRODUCER_TEST = 'state::tests::captured_merge_game::native_seeded_street_deadline_capture_exports_verified_public_bundle'
STOCK_PRODUCER_TEST = 'state::tests::captured_merge_game::native_stock_deadline_capture_exports_verified_public_bundle'
RETAINED_TEST = 'game_replay_retained_endpoint::retained_native_export_matches_original_public_bundle'
CODEC_TEST = 'execution_proofs::game_bundle::tests::game_replay_export_native_sdk_fixture'
STOCK_CODEC_TEST = 'execution_proofs::game_bundle::tests::stock_replay_export_native_sdk_fixture'
SOURCE_NAMES = [
    'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo/config.toml', 'scripts/cargo_fast.sh',
    'crates/iroha_data_model/Cargo.toml', 'crates/iroha_data_model/src/execution_proofs.rs',
    'crates/iroha_data_model/src/execution_proofs/game_bundle.rs',
    'crates/iroha_core/Cargo.toml', 'crates/iroha_core/src/execution_proofs/bundle.rs',
    'crates/iroha_core/src/execution_proofs/bundle/model.rs',
    'crates/iroha_core/src/execution_proofs/bundle/transport.rs',
    'crates/iroha_core/src/execution_proofs/bundle/tests.rs',
    'crates/iroha_core/src/execution_proofs/bundle/stock.rs',
    'crates/iroha_core/src/execution_proofs/bundle/stock_tests.rs',
    'crates/iroha_core/src/execution_proofs/finalized/mod.rs',
    'crates/iroha_core/src/execution_proofs/finalized/context.rs',
    'crates/iroha_core/src/execution_proofs/finalized/street.rs',
    'crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs',
    'crates/iroha_core/src/execution_proofs/street_v1/accepted.rs',
    'crates/iroha_core/src/execution_proofs/street_v1/accepted/identity.rs',
    'crates/iroha_core/src/execution_proofs/street_v1/compiler/tests/owned_sequence.rs',
    'crates/iroha_core/src/kura.rs', 'crates/iroha_core/src/kura/game_bundle_export.rs',
    'crates/iroha_core/src/state.rs', 'crates/iroha_core/src/snapshot.rs',
    'crates/iroha_core/src/state/deserialize_core.rs',
    'crates/iroha_core/src/state/deserialize_world.rs',
    'crates/iroha_core/src/state/captured_merge_game_tests.rs',
    'crates/iroha_core/src/state/autonomous_merge_and_queue_plan_test_support.rs',
    'crates/iroha_core/src/state/tests.rs', 'crates/iroha_core/src/kiso.rs',
    'crates/iroha_torii/Cargo.toml', 'crates/iroha_torii/src/lib.rs',
    'crates/iroha_torii/src/game_replay.rs', 'crates/iroha_torii/src/game.rs',
    'crates/iroha_torii/src/test_utils.rs', 'crates/iroha_torii/src/router/builder.rs',
    'crates/iroha_torii/src/tests/lib_runtime_handlers/part_1.rs',
    'crates/iroha_torii/tests/game_replay_retained_endpoint.rs',
    'crates/iroha_torii/tests/grouped/core_routes.rs',
    'crates/iroha_config/Cargo.toml', 'crates/iroha_config/src/parameters/actual.rs',
    'crates/iroha_config/src/parameters/user.rs', 'crates/iroha_config/src/parameters/defaults.rs',
    'crates/iroha_config/tests/game_replay_export.rs',
    'crates/iroha_config/tests/iroha_config_integration.rs',
    'crates/iroha_config/tests/fixtures/base.toml',
    'crates/iroha_config/tests/fixtures/minimal_config_snapshot.txt',
    'crates/iroha_torii_shared/Cargo.toml', 'crates/iroha_torii_shared/src/route_catalog.rs',
    'crates/iroha_torii_shared/src/route_catalog/tests.rs', 'specs/game_replay_export.md',
    'crates/iroha_cli/Cargo.toml', 'crates/iroha_cli/src/execution.rs',
    'crates/iroha_cli/src/main_shared.rs', 'crates/iroha_cli/src/execution_bundle.rs',
    'crates/iroha_cli/src/execution_worker.rs', 'crates/iroha_cli/src/execution_worker_http.rs',
]
FALSE_SCOPE = ['streetProfileRegistered', 'nativeStreetAdmission', 'priorLifecycleReplayed',
               'stateOverlayCommitted', 'deployedNetworkTrust', 'settlementVerified',
               'composedSecurityQualified', 'custodyFundingActivated', 'wsvRestartQualified',
               'authenticatedSnapshotRestored']
FALSE_REPORT = ['profile_registered', 'settlement_verified', 'latest_freshness_verified',
                'removal_transitions_replayed', 'composed_security_qualified']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identity(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), f'Expected direct regular file: {path}')
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        after = os.fstat(stream.fileno())
    stamp = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    require(stamp(before) == stamp(after) == stamp(path.stat()), f'File changed while hashing: {path}')
    return {'path': str(path), 'bytes': after.st_size, 'sha256': digest}


def copy_exact(source, destination):
    before = identity(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Path(source).open('rb') as src, destination.open('xb') as dst:
        shutil.copyfileobj(src, dst)
    copied = identity(destination)
    require(before == identity(source), f'Source changed while copying: {source}')
    require((before['bytes'], before['sha256']) == (copied['bytes'], copied['sha256']), 'Copy differs')
    return before, copied


def inventory(directory):
    rows = {}
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), f'Symlink in owned fixture: {path}')
        if path.is_file():
            rows[str(path.relative_to(directory))] = identity(path)
        else:
            require(path.is_dir(), f'Unexpected owned fixture entry: {path}')
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--iroha-root', required=True, type=Path)
    parser.add_argument('--lane', required=True, help='native-game-replay-attempt-N (create-only)')
    args = parser.parse_args()
    require(args.iroha_root.is_absolute() and args.iroha_root.resolve(strict=True) == NATIVE,
            'Use the isolated native worktree only')
    require(sys.platform == 'darwin', 'This retained Apple-linker lane targets macOS')
    require(re.fullmatch(r'native-game-replay-attempt-[1-9][0-9]*', args.lane), 'Invalid fresh lane name')
    target = NATIVE / 'target'
    require(target.is_dir(), 'Existing warm native target is required')
    if os.environ.get('CARGO_TARGET_DIR'):
        require(Path(os.environ['CARGO_TARGET_DIR']).resolve() == target, 'Unexpected target override')
    for name in ['RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_BUILD_TARGET', 'RUSTC_WORKSPACE_WRAPPER',
                 'RUSTC_BOOTSTRAP', 'CARGO_BUILD_JOBS', 'SORA_CARS_NATIVE_STREET_PRODUCER_OUTPUT',
                 'SORA_CARS_NATIVE_STREET_RETAIN_KURA', 'SORA_CARS_GAME_REPLAY_CODEC_FIXTURE',
                 'SORA_CARS_STOCK_REPLAY_CODEC_FIXTURE',
                 'SORA_CARS_REPLAY_TORII_FIXTURE', 'SORA_CARS_REPLAY_TORII_CONTROL']:
        require(not os.environ.get(name), f'Unrecorded build/test override: {name}')
    out = ROOT / 'output/qualification' / args.lane
    out.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'sora-cars.native-game-replay.v1', 'status': 'running',
              'nativeRoot': str(NATIVE), 'warmTarget': str(target), 'sources': {}, 'snapshots': {},
              'tools': {}, 'commands': [], 'builds': {}, 'tests': [],
              'scope': 'Selected native codecs, bounded Stock Torii transport and two distinct synthetic-prestate producer exports. Street State restoration remains rejected and its positive Torii gate remains open; not full build provenance or deployment qualification',
              'qualification': {'productionToriiCheck': False, 'selectedNativeTests': False,
                                'nativeCodecFixture': False, 'nativeProducerAndKura': False,
                                'retainedStockToriiReplay': False, 'retainedStreetToriiReplay': False,
                                'fourValidators': False,
                                'admittedLifecycle': False, 'fullRace': False,
                                'composedSecurity': False, 'liveStakes': False, 'deployment': False}}
    interrupted = []

    def persist():
        temporary = out / 'report.json.tmp'
        with temporary.open('x') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
        temporary.replace(out / 'report.json')

    def on_signal(number, _frame):
        interrupted.append(number)
        report['interruptionRequested'] = interrupted[:]
        # A signal can arrive during atomic report persistence. Defer all I/O
        # until the owned-command observation loop resumes; never signal Cargo.

    def unchanged():
        for group in ['sources', 'snapshots', 'tools']:
            for path, before in report[group].items():
                require(identity(path) == before, f'Frozen input changed: {path}')

    env = dict(os.environ)
    env.update(PATH=str(TOOLCHAIN) + os.pathsep + env.get('PATH', ''),
               RUSTC=str(TOOLCHAIN / 'rustc'), RUSTDOC=str(TOOLCHAIN / 'rustdoc'),
               CARGO_TARGET_DIR=str(target), GIT_OPTIONAL_LOCKS='0')
    report['environment'] = {key: env[key] for key in ['PATH', 'RUSTC', 'RUSTDOC', 'CARGO_TARGET_DIR', 'GIT_OPTIONAL_LOCKS']}
    old_handlers = {sig: signal.signal(sig, on_signal) for sig in [signal.SIGINT, signal.SIGTERM]}
    persist()

    def run(argv, label, extra_env=None):
        require(not interrupted, 'Run interrupted before next command')
        unchanged()
        argv = [str(value) for value in argv]
        receipt = {'name': label, 'argv': argv, 'cwd': str(NATIVE), 'extraEnvironment': extra_env or {}, 'status': 'starting'}
        report['commands'].append(receipt)
        persist()
        started = time.monotonic()
        stdout, stderr = out / f'{label}.stdout', out / f'{label}.stderr'
        with stdout.open('xb') as a, stderr.open('xb') as b:
            child = subprocess.Popen(argv, cwd=NATIVE, env=dict(env, **(extra_env or {})),
                                     stdin=subprocess.DEVNULL, stdout=a, stderr=b, start_new_session=True)
            receipt.update(pid=child.pid, status='running')
            report['activeProcess'] = {'pid': child.pid, 'command': label}
            persist()
            print(f'{label}: pid {child.pid}', flush=True)
            while True:
                try:
                    code = child.wait(timeout=30)
                    break
                except subprocess.TimeoutExpired:
                    receipt['elapsedSeconds'] = time.monotonic() - started
                    persist()
                    print(f'{label}: same owned process {child.pid} remains live', flush=True)
        receipt.update(status='finished', exitCode=code, seconds=time.monotonic() - started,
                       stdout=identity(stdout), stderr=identity(stderr))
        report.pop('activeProcess', None)
        persist()
        require(code == 0, f'{label} failed with {code}; retained logs are authoritative')
        require(not interrupted, 'Interrupted; owned command completed without being signalled')
        unchanged()
        return stdout.read_text(), receipt

    def cargo_messages(text):
        messages = []
        for line in text.splitlines():
            if line.startswith('{'):
                messages.append(json.loads(line))
            else:
                require(not line.strip() or line.startswith('[cargo-fast]'), 'Unexpected Cargo stdout')
        require([m['success'] for m in messages if m.get('reason') == 'build-finished'] == [True],
                'Cargo did not emit one successful completion')
        return messages

    def build(label, package, target_name, target_kind, target_args):
        output, _ = run([*wrapper, 'test', *target_args, '--no-run', '--locked', '--offline', '-p', package,
                         '--message-format=json-render-diagnostics'], label)
        messages = cargo_messages(output)
        manifest = str(NATIVE / 'crates' / package / 'Cargo.toml')
        emitted = [m for m in messages if m.get('reason') == 'compiler-artifact'
                   and m.get('manifest_path') == manifest and m['target']['name'] == target_name
                   and target_kind in m['target']['kind'] and m['profile']['test'] is True and m.get('executable')]
        require(len(emitted) == 1, f'Expected one current Cargo executable: {label}')
        binary = Path(emitted[0]['executable']).resolve(strict=True)
        require(binary.is_relative_to(target), 'Executable escaped warm target')
        original, retained = copy_exact(binary, out / 'binaries' / label)
        Path(retained['path']).chmod(0o500)
        report['builds'][label] = {'artifact': emitted[0], 'emittedExecutable': original,
                                    'retainedExecutable': retained}
        listing, _ = run([retained['path'], '--list'], label + '-list')
        names = re.findall(r'^(\S+): test$', listing, re.M)
        require(names and len(names) == len(set(names)), 'Unique nonempty emitted test inventory required')
        report['builds'][label]['testNames'] = names
        persist()
        return Path(retained['path']), names

    def tests(binary, listed, label, names, extra_env=None, ignored=False):
        require(names and len(names) == len(set(names)) and set(names) <= set(listed), f'Expected tests absent: {label}')
        for index, name in enumerate(names):
            require(identity(binary) == report['builds'][binary.name]['retainedExecutable'], 'Retained test executable changed')
            argv = [binary, name, '--exact', '--test-threads=1', '--nocapture']
            if ignored:
                argv.append('--ignored')
            text, receipt = run(argv, f'{label}-{index + 1}', extra_env)
            summaries = re.findall(r'^test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured;', text, re.M)
            require(summaries == [('1', '0', '0', '0')], f'One exact named test must pass: {name}')
            require(re.search(r'^test ' + re.escape(name) + r' \.\.\.', text, re.M), f'Exact test was not entered: {name}')
            report['tests'].append({'name': name, 'command': receipt['name'], 'binarySha256': identity(binary)['sha256'], 'passed': True})
            persist()

    def declared(relative, prefix, predicate=lambda _name: True):
        source = NATIVE / relative
        names = [prefix + name for name in TEST_DECLARATION.findall(source.read_text()) if predicate(name)]
        require(names and len(names) == len(set(names)), 'Explicit source test declarations required')
        return names

    try:
        for tool in ['cargo', 'rustc', 'rustdoc']:
            report['tools'][str(TOOLCHAIN / tool)] = identity(TOOLCHAIN / tool)
        for relative in SOURCE_NAMES:
            before, copied = copy_exact(NATIVE / relative, out / 'source/native' / relative)
            report['sources'][before['path']] = before
            report['snapshots'][copied['path']] = copied
        before, copied = copy_exact(Path(__file__).resolve(), out / 'source/runner.py')
        report['sources'][before['path']] = before
        report['snapshots'][copied['path']] = copied
        version, _ = run([TOOLCHAIN / 'rustc', '-vV'], 'compiler-version')
        require(re.search(r'^release: 1\.93\.1$', version, re.M) and 'host: aarch64-apple-darwin' in version,
                'Exact Rust 1.93.1 Apple host required')
        report['compilerVersion'] = version
        report['nativeHead'] = run(['git', 'rev-parse', 'HEAD'], 'native-head')[0].strip()
        branch = run(['git', 'symbolic-ref', '--short', 'HEAD'], 'native-branch')[0].strip()
        require(branch == 'codex/sora-cars-native', 'Unexpected isolated branch')
        report['nativeBranch'] = branch
        wrapper = ['/bin/bash', NATIVE / 'scripts/cargo_fast.sh', '--stable-local-metadata', '--no-incremental', '--linker', 'off', '--']
        selections = {
            'model-libtest': declared('crates/iroha_data_model/src/execution_proofs/game_bundle.rs', 'execution_proofs::game_bundle::tests::'),
            'core-libtest': (
                ['state::tests::captured_merge_game::native_stock_original_prestate_restores_before_capture']
                + declared('crates/iroha_core/src/execution_proofs/bundle/tests.rs', 'execution_proofs::bundle::tests::', lambda name: name.startswith('native_replay_export_request_'))
                + declared('crates/iroha_core/src/execution_proofs/bundle/stock_tests.rs', 'execution_proofs::bundle::stock::tests::', lambda name: name.startswith('stock_native_'))
                + ['execution_proofs::street_v1::compiler::tests::owned_sequence::native_owned_finalized_record_and_genuine_proof_are_bound_together']
            ),
            'torii-libtest': declared('crates/iroha_torii/src/game_replay.rs', 'game_replay::tests::'),
            'config-integration': declared('crates/iroha_config/tests/game_replay_export.rs', 'game_replay_export::'),
            'torii-shared-libtest': ['route_catalog::tests::game_replay_is_an_exact_generic_public_read_only_post'],
        }
        require({CODEC_TEST, STOCK_CODEC_TEST} <= set(selections['model-libtest']),
                'Both native computation codec export fixture tests must be selected')
        report['selectedTestDeclarations'] = selections
        builds = {}
        for label, package, name, kind, selectors in [
            ('model-libtest', 'iroha_data_model', 'iroha_data_model', 'lib', ['--lib']),
            ('core-libtest', 'iroha_core', 'iroha_core', 'lib', ['--lib']),
            ('torii-libtest', 'iroha_torii', 'iroha_torii', 'lib', ['--lib']),
            ('config-integration', 'iroha_config', 'iroha_config_integration', 'test', ['--test', 'iroha_config_integration']),
            ('torii-shared-libtest', 'iroha_torii_shared', 'iroha_torii_shared', 'lib', ['--lib']),
            ('torii-core-routes', 'iroha_torii', 'torii_core_routes', 'test', ['--test', 'torii_core_routes']),
        ]:
            builds[label] = build(label, package, name, kind, selectors)
            if label == 'model-libtest':
                # Export the actual shared Rust vector first so SDK parity work
                # can proceed while the larger native targets compile.
                model_selected = selections[label]
                for test_name in model_selected:
                    extra = ({'SORA_CARS_GAME_REPLAY_CODEC_FIXTURE': str(out / 'codec-fixture.json')} if test_name == CODEC_TEST else
                             {'SORA_CARS_STOCK_REPLAY_CODEC_FIXTURE': str(out / 'codec-stock-fixture.json')} if test_name == STOCK_CODEC_TEST else None)
                    tests(*builds[label], label + '-' + test_name.rsplit('::', 1)[-1], [test_name], extra)
                cargo_messages(run([*wrapper, 'check', '--locked', '--offline', '-p', 'iroha_torii', '--lib',
                                    '--message-format=json-render-diagnostics'], 'cargo-production-torii-check')[0])
                report['qualification']['productionToriiCheck'] = True
            elif label in selections:
                # Exercise each emitted binary immediately. In particular, the
                # original-State recovery check precedes expensive proof tests
                # and unrelated target builds; no required test is omitted.
                for name in selections[label]:
                    tests(*builds[label], label + '-' + name.rsplit('::', 1)[-1], [name])
        report['codecFixtures'] = {}
        for computation, filename in [('street', 'codec-fixture.json'), ('stock_race', 'codec-stock-fixture.json')]:
            fixture = json.loads((out / filename).read_text())
            require(fixture['version'] == 1 and fixture['computation'] == computation, 'Exact native SDK computation fixture')
            for name in ['request', 'evidence', 'export']:
                require(len(bytes.fromhex(fixture[name + '_hex'])) == fixture[name + '_bytes'] > 0, 'Native fixture length differs')
            require(all(fixture[name] > 0 for name in ['batches', 'reveals', 'commitments']), 'Populated public codec evidence required')
            report['codecFixtures'][computation] = identity(out / filename)
        report['qualification'].update(selectedNativeTests=True, nativeCodecFixture=True)
        exports = out / 'exports'
        exports.mkdir()
        report['producers'] = {}
        for computation, test_name, case in [
            ('street', PRODUCER_TEST, 'producer-deadline-n0'),
            ('stock_race', STOCK_PRODUCER_TEST, 'producer-stock-deadline-n0'),
        ]:
            tests(*builds['core-libtest'], 'native-producer-' + computation, [test_name], {
                'SORA_CARS_NATIVE_STREET_PRODUCER_OUTPUT': str(exports), 'SORA_CARS_NATIVE_STREET_RETAIN_KURA': '1'})
            producer = exports / case
            scope = json.loads((producer / 'scope.json').read_text())
            verification = json.loads((producer / 'verifier-report.json').read_text())
            require(all(scope[name] is False for name in FALSE_SCOPE), 'Producer fixture cannot upgrade release qualification')
            require(scope['nativeSignedDeadlineExecuted'] is True and scope['nativeKuraRetainedBytes'] is True
                    and scope['motionSteps'] == 0 and scope['terminalTick'] == 0, 'Actual bounded native producer scope required')
            restored = computation == 'stock_race'
            require(scope['retainedPrestateHydratedWithDurableRecovery'] is restored, 'Only valid native Stock prestate restores')
            require((scope['retainedPrestateRejection'] is None) is restored, 'Street missing admission remains an explicit rejection')
            require(all(verification[name] is False for name in FALSE_REPORT), 'Native verifier upgraded release qualification')
            require(verification['record_finality_verified'] is True and verification['computation_verified'] is True
                    and verification['computation']['kind'] == computation, 'Exact native producer proof and record must verify')
            manifest = json.loads((producer / 'kura-store.json').read_text())
            store = Path(manifest['path']).resolve(strict=True)
            require(manifest['version'] == 1 and store.is_relative_to(exports) and store.is_dir(), 'Actual owned retained Kura required')
            require(manifest['computation']['kind'] == computation and manifest['restored'] is restored,
                    'Retained manifest must distinguish both actual computations and restoration outcomes')
            prestate = manifest['prestate']
            require(prestate['file'] == 'state-prestate.json', 'Exact original native prestate fixture required')
            prestate_identity = identity(producer / prestate['file'])
            require(0 < prestate_identity['bytes'] <= 16 * 1024 * 1024
                    and prestate_identity['bytes'] == prestate['bytes']
                    and prestate_identity['sha256'] == prestate['sha256'], 'Original native prestate digest differs')
            require(isinstance(manifest['chain_id'], str) and bool(manifest['chain_id'])
                    and manifest['prestate_height'] == 5, 'Original prestate context must remain explicit')
            before_store = inventory(store)
            require(before_store, 'Retained Kura store cannot be empty')
            report['producers'][computation] = {
                'scope': scope, 'verification': verification, 'files': inventory(producer),
                'retainedStore': str(store), 'storeBeforeTorii': before_store,
                'prestate': prestate_identity,
                'prestateScope': 'Exact synthetic native prestate, not an authenticated snapshot or committed game overlay; Street normal recovery rejects its unregistered profile'}
            if restored:
                tests(*builds['torii-core-routes'], 'retained-stock-torii-export', [RETAINED_TEST],
                      {'SORA_CARS_REPLAY_TORII_FIXTURE': str(producer)}, ignored=True)
                after_store = inventory(store)
                report['producers'][computation]['storeAfterTorii'] = after_store
                report['producers'][computation]['storageChangesOnReopen'] = [name for name in sorted(set(before_store) | set(after_store)) if before_store.get(name) != after_store.get(name)]
                require(inventory(producer) == report['producers'][computation]['files'], 'Public producer fixture changed during Torii test')
                report['qualification']['retainedStockToriiReplay'] = True
        report['qualification']['nativeProducerAndKura'] = True
        # Build the production CLI from this same frozen source family only
        # after the focused native/Torii gates pass. Browser proof integration
        # consumes this exact retained artifact, never an older warm binary.
        output, _ = run([*wrapper, 'build', '--locked', '--offline', '-p', 'iroha_cli', '--bin', 'iroha',
                         '--message-format=json-render-diagnostics'], 'cargo-production-cli')
        messages = cargo_messages(output)
        manifest_path = str(NATIVE / 'crates/iroha_cli/Cargo.toml')
        emitted = [message for message in messages if message.get('reason') == 'compiler-artifact'
                   and message.get('manifest_path') == manifest_path and message['target']['name'] == 'iroha'
                   and 'bin' in message['target']['kind'] and message['profile']['test'] is False
                   and message.get('executable')]
        require(len(emitted) == 1, 'One current production CLI artifact required')
        cli_path = Path(emitted[0]['executable']).resolve(strict=True)
        require(cli_path.is_relative_to(target), 'Current CLI escaped the warm target')
        original, retained = copy_exact(cli_path, out / 'binaries/production-cli')
        Path(retained['path']).chmod(0o500)
        report['productionCli'] = {'artifact': emitted[0], 'emittedExecutable': original,
                                    'retainedExecutable': retained}
        for build_report in report['builds'].values():
            before = build_report['retainedExecutable']
            require(identity(before['path']) == before, 'Retained executable changed')
        unchanged()
        report['status'] = 'passed'
    except BaseException as error:
        report.update(status='failed', failure=f'{type(error).__name__}: {error}')
        raise
    finally:
        persist()
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        print(json.dumps({'status': report['status'], 'report': str(out / 'report.json')}), flush=True)


if __name__ == '__main__':
    main()
