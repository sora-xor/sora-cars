#!/usr/bin/env python3
"""Continue the exact failed native replay endpoint gate without rerunning proofs.

This is a new qualification receipt, never a promotion or rewrite of its failed
base run. It inherits 29 individually verified tests and two native producers,
permits exactly one fixture CORS spelling correction, rebuilds the current Torii
test target, runs its shipping retained-Stock endpoint against an owned exact
copy, and only then builds the current production CLI. No browser, four-validator,
whole-race, composed 128-bit security, funding, or live-network claim is made.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT.parent / 'iroha-sora-cars-native'
TOOLCHAIN = Path('/Users/takemiyamakoto/.rustup/toolchains/1.93.1-aarch64-apple-darwin/bin')
FIXTURE = 'crates/iroha_torii/tests/game_replay_retained_endpoint.rs'
OLD_CORS = b'cfg.torii.cors.allowed_headers = vec!["Content-Type".into(), "Accept".into()];'
NEW_CORS = b'cfg.torii.cors.allowed_headers = vec!["content-type".into(), "accept".into()];'
RETAINED_TEST = 'game_replay_retained_endpoint::retained_native_export_matches_original_public_bundle'
SERVE_TEST = 'game_replay_retained_endpoint::serve_retained_native_export_for_browser'
FAILED_COMMAND = 'retained-stock-torii-export-1'
BASE_FAILURE = 'ValueError: retained-stock-torii-export-1 failed with 101; retained logs are authoritative'
BUILD_NAMES = {'model-libtest', 'core-libtest', 'torii-libtest', 'config-integration',
               'torii-shared-libtest', 'torii-core-routes'}
PRODUCER_NAMES = {
    'street': 'state::tests::captured_merge_game::native_seeded_street_deadline_capture_exports_verified_public_bundle',
    'stock_race': 'state::tests::captured_merge_game::native_stock_deadline_capture_exports_verified_public_bundle',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identity(path):
    path = Path(path)
    require(path.is_absolute() and path.is_file() and not path.is_symlink(),
            f'Expected absolute direct regular file: {path}')
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode), f'Nonregular evidence file: {path}')
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
    require((before['bytes'], before['sha256']) == (copied['bytes'], copied['sha256']),
            f'Copy differs: {destination}')
    return before, copied


def inventory(directory):
    require(directory.is_absolute() and directory.is_dir() and not directory.is_symlink(),
            f'Expected direct absolute directory: {directory}')
    files, directories = {}, []
    for path in sorted(directory.rglob('*')):
        require(not path.is_symlink(), f'Symlink in retained evidence: {path}')
        name = str(path.relative_to(directory))
        if path.is_file():
            require(path.stat().st_nlink == 1, f'Multiply linked retained tree file: {path}')
            files[name] = identity(path)
        else:
            require(path.is_dir(), f'Unexpected retained evidence entry: {path}')
            directories.append(name)
    return {'files': files, 'directories': directories}


def content_inventory(value):
    return {'directories': value['directories'], 'files': {
        name: {key: row[key] for key in ['bytes', 'sha256']}
        for name, row in value['files'].items()}}


def copy_tree(source, destination, expected):
    require(inventory(source) == expected, f'Retained tree changed before copy: {source}')
    destination.mkdir(parents=True, exist_ok=False)
    for name in expected['directories']:
        (destination / name).mkdir(parents=True, exist_ok=False)
    for name in expected['files']:
        copy_exact(source / name, destination / name)
    copied = inventory(destination)
    require(content_inventory(copied) == content_inventory(expected), 'Exact tree copy differs')
    require(inventory(source) == expected, 'Original tree changed during copy')
    return copied


def exact_test_pass(text, name):
    summaries = re.findall(r'^test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured;', text, re.M)
    require(summaries == [('1', '0', '0', '0')], f'One exact test must pass: {name}')
    require(re.search(r'^test ' + re.escape(name) + r' \.\.\.', text, re.M),
            f'Exact test was not entered: {name}')


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--iroha-root', required=True, type=Path)
    parser.add_argument('--base-report', required=True, type=Path)
    parser.add_argument('--lane', required=True, help='native-game-replay-followup-attempt-N (create-only)')
    args = parser.parse_args()
    require(sys.platform == 'darwin', 'This Apple-linker corridor targets macOS')
    require(args.iroha_root.is_absolute() and args.iroha_root.resolve(strict=True) == NATIVE,
            'Use the isolated native worktree only')
    require(args.base_report.is_absolute() and args.base_report.name == 'report.json'
            and args.base_report.parent.parent == ROOT / 'output/qualification'
            and re.fullmatch(r'native-game-replay-attempt-[1-9][0-9]*', args.base_report.parent.name),
            'An explicit original native qualification report is required')
    require(re.fullmatch(r'native-game-replay-followup-attempt-[1-9][0-9]*', args.lane),
            'Invalid fresh follow-up lane name')
    target = NATIVE / 'target'
    require(target.is_dir(), 'The existing warm target is required')
    if os.environ.get('CARGO_TARGET_DIR'):
        require(Path(os.environ['CARGO_TARGET_DIR']).resolve() == target, 'Unexpected target override')
    prohibited = ['RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'CARGO_BUILD_TARGET',
                  'RUSTC_WORKSPACE_WRAPPER', 'RUSTC_WRAPPER', 'RUSTC_BOOTSTRAP', 'CARGO_BUILD_JOBS',
                  'RUSTC', 'RUSTDOC', 'RUSTUP_TOOLCHAIN', 'CARGO_HOME', 'CARGO_INCREMENTAL',
                  'CARGO_FAST_TARGET_ROOT', 'VERGEN_GIT_SHA']
    for name in os.environ:
        if (name in prohibited or name.startswith(('CARGO_PROFILE_', 'CARGO_TARGET_', 'CARGO_BUILD_'))
                or name.startswith('SORA_CARS_')) and name != 'CARGO_TARGET_DIR':
            require(not os.environ[name], f'Unrecorded build/test override: {name}')
    out = ROOT / 'output/qualification' / args.lane
    out.mkdir(parents=True, exist_ok=False)
    report = {
        'schema': 'sora-cars.native-game-replay-followup.v1', 'status': 'running',
        'nativeRoot': str(NATIVE), 'warmTarget': str(target), 'sources': {}, 'snapshots': {},
        'tools': {}, 'inheritedInputs': {}, 'outputs': {}, 'commands': [], 'builds': {}, 'tests': [],
        'inheritedTests': [], 'producers': {}, 'cleanup': {},
        'scope': 'Focused new retained-Stock Torii endpoint test and production CLI build. '
                 'The failed base run stays failed; its 29 tests and both zero-motion native producers '
                 'are explicitly inherited. Street admission and its positive Torii gate remain open. '
                 'Selected sources only, not complete build provenance or deployment qualification.',
        'qualification': {'productionToriiCheckInherited': False, 'selectedNativeTestsInherited': False,
                          'nativeCodecFixtureInherited': False, 'nativeProducerEvidenceInherited': False,
                          'retainedStockToriiReplay': False, 'retainedStreetToriiReplay': False,
                          'fourValidators': False, 'admittedLifecycle': False, 'fullRace': False,
                          'composedSecurity': False, 'liveStakes': False, 'deployment': False},
    }
    interrupted, original_trees = [], {}
    owned_fixture = owned_store = None
    owned_before = None
    started_at = time.time()
    report['startedUnixSeconds'] = started_at

    def persist():
        temporary = out / f'report-{time.monotonic_ns()}.json.tmp'
        owned = None
        try:
            with temporary.open('x') as stream:
                opened = os.fstat(stream.fileno())
                owned = (opened.st_dev, opened.st_ino)
                json.dump(report, stream, indent=2)
                stream.write('\n')
            temporary.replace(out / 'report.json')
        except BaseException as error:
            if owned is not None:
                try:
                    current = temporary.lstat()
                    require((current.st_dev, current.st_ino) == owned,
                            'Failed report temporary file was replaced; preserve it')
                    temporary.unlink()
                except FileNotFoundError:
                    pass
                except BaseException as cleanup_error:
                    error.add_note(f'Owned report temporary cleanup also failed: {cleanup_error}')
            raise

    def on_signal(number, _frame):
        interrupted.append(number)
        report['interruptionRequested'] = interrupted[:]
        # Preserve the existing native corridor: observe/reap an owned Cargo
        # command rather than interrupting its worktree or abandoning its child.

    old_handlers = {sig: signal.signal(sig, on_signal) for sig in [signal.SIGINT, signal.SIGTERM]}
    env = dict(os.environ)
    env.update(PATH=str(TOOLCHAIN) + os.pathsep + env.get('PATH', ''),
               RUSTC=str(TOOLCHAIN / 'rustc'), RUSTDOC=str(TOOLCHAIN / 'rustdoc'),
               CARGO_TARGET_DIR=str(target), GIT_OPTIONAL_LOCKS='0')
    report['environment'] = {key: env[key] for key in ['PATH', 'RUSTC', 'RUSTDOC', 'CARGO_TARGET_DIR', 'GIT_OPTIONAL_LOCKS']}
    wrapper = ['/bin/bash', NATIVE / 'scripts/cargo_fast.sh', '--stable-local-metadata',
               '--no-incremental', '--linker', 'off', '--']

    def pin(row, group='inheritedInputs'):
        require(identity(row['path']) == row, f'Evidence identity differs: {row["path"]}')
        report[group][row['path']] = row

    def unchanged():
        for group in ['sources', 'snapshots', 'tools', 'inheritedInputs', 'outputs']:
            for path, before in report[group].items():
                require(identity(path) == before, f'Frozen input changed: {path}')
        for path, before in original_trees.items():
            require(inventory(Path(path)) == before, f'Original retained evidence tree changed: {path}')
        for row in report['builds'].values():
            require(identity(row['retainedExecutable']['path']) == row['retainedExecutable'],
                    'Current retained test executable changed')
        if report.get('productionCli'):
            row = report['productionCli']['retainedExecutable']
            require(identity(row['path']) == row, 'Current retained CLI changed')
        if owned_fixture is not None:
            require(inventory(owned_fixture) == report['producers']['stock_race']['ownedFixtureInventory'],
                    'Owned public producer fixture changed')

    def run(argv, label, extra_env=None):
        require(not interrupted, 'Interrupted before the next command')
        unchanged()
        argv = [str(value) for value in argv]
        receipt = {'name': label, 'argv': argv, 'cwd': str(NATIVE),
                   'extraEnvironment': extra_env or {}, 'status': 'starting', 'startedUnixSeconds': time.time()}
        report['commands'].append(receipt)
        persist()
        started = time.monotonic()
        stdout, stderr = out / f'{label}.stdout', out / f'{label}.stderr'
        command_failure = None
        try:
            with stdout.open('xb') as a, stderr.open('xb') as b:
                child = subprocess.Popen(argv, cwd=NATIVE, env=dict(env, **(extra_env or {})),
                                         stdin=subprocess.DEVNULL, stdout=a, stderr=b, start_new_session=True)
                receipt.update(pid=child.pid, status='running')
                report['activeProcess'] = {'pid': child.pid, 'command': label}
                try:
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
                finally:
                    # Even a diagnostic/persistence failure cannot abandon Cargo
                    # or leave its exact native test child unreaped.
                    if child.poll() is None:
                        child.wait()
                    report.pop('activeProcess', None)
                    receipt.update(status='finished', exitCode=child.returncode,
                                   seconds=time.monotonic() - started, childReaped=True)
            require(code == 0, f'{label} failed with {code}; retained logs are authoritative')
        except BaseException as error:
            command_failure = error
            raise
        finally:
            log_errors = []
            for channel, path in [('stdout', stdout), ('stderr', stderr)]:
                try:
                    row = identity(path)
                    receipt[channel] = row
                    pin(row, 'outputs')
                except BaseException as error:
                    log_errors.append(f'{channel}: {type(error).__name__}: {error}')
            if log_errors:
                receipt['logCaptureErrors'] = log_errors
                if command_failure is not None:
                    command_failure.add_note('Command log capture also failed: ' + '; '.join(log_errors))
                else:
                    raise RuntimeError('; '.join(log_errors))
        persist()
        require(not interrupted, 'Interrupted; owned command completed without being signalled')
        unchanged()
        return stdout.read_text(), receipt

    def retain_artifact(messages, package, name, kind, test, label):
        selected = [m for m in messages if m.get('reason') == 'compiler-artifact'
                    and m.get('manifest_path') == str(NATIVE / 'crates' / package / 'Cargo.toml')
                    and m['target']['name'] == name and kind in m['target']['kind']
                    and m['profile']['test'] is test and m.get('executable')]
        require(len(selected) == 1, f'One current Cargo artifact required: {label}')
        binary = Path(selected[0]['executable']).resolve(strict=True)
        require(binary.is_relative_to(target), 'Current Cargo executable escaped the warm target')
        original, retained = copy_exact(binary, out / 'binaries' / label)
        Path(retained['path']).chmod(0o500)
        return {'artifact': selected[0], 'emittedExecutable': original, 'retainedExecutable': retained}

    persist()
    try:
        require(args.base_report.stat().st_size <= 16 * 1024 * 1024, 'Base report exceeds 16 MiB')
        base_id, copied_base = copy_exact(args.base_report, out / 'base-report.json')
        pin(base_id)
        pin(copied_base, 'snapshots')
        base = json.loads((out / 'base-report.json').read_text())
        require(base['schema'] == 'sora-cars.native-game-replay.v1' and base['status'] == 'failed'
                and base['failure'] == BASE_FAILURE and base['nativeRoot'] == str(NATIVE)
                and base['warmTarget'] == str(target), 'Only the exact failed retained-Stock gate is eligible')
        report['baseEvidence'] = {'report': base_id, 'retainedReport': copied_base,
                                  'status': 'failed', 'failure': base['failure'],
                                  'qualification': base['qualification']}
        # Import only the exact previously snapshotted local runner. This reuses
        # its selected-source/test policy without executing main or editing it.
        original_runner = ROOT / 'scripts/test-native-game-replay.py'
        pin(base['sources'][str(original_runner)])
        spec = importlib.util.spec_from_file_location('retained_native_base_policy', original_runner)
        policy = importlib.util.module_from_spec(spec)
        # Compile the verified bytes directly, without creating __pycache__ in
        # the original source tree or running the original main entry point.
        exec(compile(original_runner.read_bytes(), str(original_runner), 'exec'), policy.__dict__)
        require(set(base['sources']) == {str(NATIVE / name) for name in policy.SOURCE_NAMES}
                | {str(original_runner)}, 'Base selected-source inventory changed')
        require(set(base['builds']) == BUILD_NAMES, 'All six original builds are mandatory')
        require(set(base['tools']) == {str(TOOLCHAIN / name) for name in ['cargo', 'rustc', 'rustdoc']},
                'Exact pinned original Rust tools required')
        for row in base['tools'].values():
            pin(row, 'tools')
        for row in base['snapshots'].values():
            require(Path(row['path']).is_relative_to(args.base_report.parent / 'source'),
                    'Base source snapshot escaped its retained directory')
            pin(row)
        for name in policy.SOURCE_NAMES:
            source = NATIVE / name
            baseline = args.base_report.parent / 'source/native' / name
            old_row = base['sources'][str(source)]
            saved_row = base['snapshots'][str(baseline)]
            require((old_row['bytes'], old_row['sha256']) == (saved_row['bytes'], saved_row['sha256']),
                    f'Base source/snapshot mismatch: {name}')
            if name == FIXTURE:
                old_bytes, current = baseline.read_bytes(), source.read_bytes()
                require(old_bytes.count(OLD_CORS) == 1 and current == old_bytes.replace(OLD_CORS, NEW_CORS, 1),
                        'Only the approved single-line lowercase CORS replacement is allowed')
                report['approvedSourceChange'] = {'path': str(source), 'base': saved_row,
                                                  'current': identity(source), 'replacementCount': 1,
                                                  'old': OLD_CORS.decode(), 'new': NEW_CORS.decode()}
            else:
                require(identity(source) == old_row, f'Unapproved native source change: {name}')
            before, copied = copy_exact(source, out / 'source/native' / name)
            pin(before, 'sources')
            pin(copied, 'snapshots')
        before, copied = copy_exact(Path(__file__).resolve(), out / 'source/followup-runner.py')
        pin(before, 'sources')
        pin(copied, 'snapshots')
        report['inheritedBuilds'] = base['builds']
        commands = {row['name']: row for row in base['commands']}
        require(len(commands) == len(base['commands']) == 46, 'Exact base command inventory required')
        require(base['commands'][-1]['name'] == FAILED_COMMAND, 'Base failed at a different gate')
        for row in base['commands']:
            require(row['status'] == 'finished' and row['exitCode'] == (101 if row['name'] == FAILED_COMMAND else 0)
                    and row['cwd'] == str(NATIVE), 'Incomplete or differently failed base command')
            for channel in ['stdout', 'stderr']:
                require(Path(row[channel]['path']).parent == args.base_report.parent, 'Base log escaped its lane')
                pin(row[channel])
        require('component: "cors.allowed_headers"' in Path(commands[FAILED_COMMAND]['stderr']['path']).read_text()
                and 'HTTP header name `Content-Type` must use canonical lowercase spelling'
                in Path(commands[FAILED_COMMAND]['stderr']['path']).read_text(), 'Base failure is not the exact CORS correction')
        require(commands[FAILED_COMMAND]['argv'] == [
                    base['builds']['torii-core-routes']['retainedExecutable']['path'],
                    RETAINED_TEST, '--exact', '--test-threads=1', '--nocapture', '--ignored']
                and commands[FAILED_COMMAND]['extraEnvironment'] == {
                    'SORA_CARS_REPLAY_TORII_FIXTURE': str(args.base_report.parent / 'exports/producer-stock-deadline-n0')},
                'The failed original endpoint command/fixture association differs')
        for label, built in base['builds'].items():
            pin(built['retainedExecutable'])
            require(commands[label]['exitCode'] == 0 and commands[label + '-list']['exitCode'] == 0,
                    'Original build/list did not pass')
            messages = cargo_messages(Path(commands[label]['stdout']['path']).read_text())
            artifact = built['artifact']
            require(artifact in messages and artifact['reason'] == 'compiler-artifact'
                    and artifact['profile']['test'] is True
                    and artifact['executable'] == built['emittedExecutable']['path']
                    and all(built['emittedExecutable'][key] == built['retainedExecutable'][key]
                            for key in ['bytes', 'sha256']), 'Original emitted/retained artifact association differs')
            actual_names = re.findall(r'^(\S+): test$', Path(commands[label + '-list']['stdout']['path']).read_text(), re.M)
            require(actual_names == built['testNames'] and len(actual_names) == len(set(actual_names)),
                    'Original emitted test inventory differs from its log')
        cargo_messages(Path(commands['cargo-production-torii-check']['stdout']['path']).read_text())
        declared = lambda relative, prefix, predicate=lambda _n: True: [
            prefix + name for name in policy.TEST_DECLARATION.findall((NATIVE / relative).read_text()) if predicate(name)]
        selections = {
            'model-libtest': declared('crates/iroha_data_model/src/execution_proofs/game_bundle.rs', 'execution_proofs::game_bundle::tests::'),
            'core-libtest': ['state::tests::captured_merge_game::native_stock_original_prestate_restores_before_capture']
                + declared('crates/iroha_core/src/execution_proofs/bundle/tests.rs', 'execution_proofs::bundle::tests::', lambda n: n.startswith('native_replay_export_request_'))
                + declared('crates/iroha_core/src/execution_proofs/bundle/stock_tests.rs', 'execution_proofs::bundle::stock::tests::', lambda n: n.startswith('stock_native_'))
                + ['execution_proofs::street_v1::compiler::tests::owned_sequence::native_owned_finalized_record_and_genuine_proof_are_bound_together'],
            'torii-libtest': declared('crates/iroha_torii/src/game_replay.rs', 'game_replay::tests::'),
            'config-integration': declared('crates/iroha_config/tests/game_replay_export.rs', 'game_replay_export::'),
            'torii-shared-libtest': ['route_catalog::tests::game_replay_is_an_exact_generic_public_read_only_post'],
        }
        require(selections == base['selectedTestDeclarations'], 'The mandatory source-selected tests differ')
        expected_tests = [name for names in selections.values() for name in names] + list(PRODUCER_NAMES.values())
        require(len(expected_tests) == len(set(expected_tests)) == 29
                and [row['name'] for row in base['tests']] == expected_tests,
                'All 29 exact native tests, including both producers, are mandatory')
        for test in base['tests']:
            command = commands[test['command']]
            label = next(label for label, built in base['builds'].items()
                         if built['retainedExecutable']['sha256'] == test['binarySha256'])
            binary = base['builds'][label]['retainedExecutable']
            require(test['passed'] is True and command['argv'] == [binary['path'], test['name'], '--exact', '--test-threads=1', '--nocapture'],
                    'Inherited named test/executable association differs')
            exact_test_pass(Path(command['stdout']['path']).read_text(), test['name'])
            report['inheritedTests'].append(dict(test, inheritedFrom=base_id))
        report['inheritedCommands'] = base['commands']
        require(all(base['qualification'][key] is True for key in ['productionToriiCheck', 'selectedNativeTests', 'nativeCodecFixture']),
                'Required earlier native gates did not pass')
        for row in base['codecFixtures'].values():
            pin(row)
        require(set(base['codecFixtures']) == {'street', 'stock_race'}, 'Both native codec fixtures are required')
        require(set(base['producers']) == {'street', 'stock_race'}, 'Both genuine native producers are required')
        for computation, producer in base['producers'].items():
            command = commands['native-producer-' + computation + '-1']
            require(command['exitCode'] == 0 and command['argv'][1] == PRODUCER_NAMES[computation]
                    and command['extraEnvironment'] == {
                        'SORA_CARS_NATIVE_STREET_PRODUCER_OUTPUT': str(args.base_report.parent / 'exports'),
                        'SORA_CARS_NATIVE_STREET_RETAIN_KURA': '1'},
                    'Exact original producer command did not pass')
            fixture_dir = Path(producer['files']['request.nrt']['path']).parent
            require(fixture_dir.parent == args.base_report.parent / 'exports', 'Producer escaped its original owned exports')
            original_files = inventory(fixture_dir)
            require(original_files['files'] == producer['files'], 'Original public producer files differ')
            original_trees[str(fixture_dir)] = original_files
            require(json.loads((fixture_dir / 'scope.json').read_text()) == producer['scope']
                    and json.loads((fixture_dir / 'verifier-report.json').read_text()) == producer['verification'],
                    'Original producer reports differ from their retained files')
            scope, verification = producer['scope'], producer['verification']
            restored = computation == 'stock_race'
            require(all(scope[key] is False for key in policy.FALSE_SCOPE)
                    and all(verification[key] is False for key in policy.FALSE_REPORT), 'Inherited evidence upgrades qualification')
            require(scope['nativeSignedDeadlineExecuted'] is True and scope['nativeKuraRetainedBytes'] is True
                    and scope['motionSteps'] == scope['terminalTick'] == 0
                    and scope['retainedPrestateHydratedWithDurableRecovery'] is restored
                    and (scope['retainedPrestateRejection'] is None) is restored
                    and verification['record_finality_verified'] is True
                    and verification['computation_verified'] is True
                    and verification['computation']['kind'] == computation, 'Unexpected inherited native producer scope')
            manifest = json.loads((fixture_dir / 'kura-store.json').read_text())
            store = Path(producer['retainedStore'])
            require(store.is_absolute() and store.is_relative_to(args.base_report.parent / 'exports')
                    and manifest['path'] == str(store) and manifest['version'] == 1
                    and manifest['computation']['kind'] == computation and manifest['restored'] is restored,
                    'Original retained Kura association differs')
            prestate = identity(fixture_dir / 'state-prestate.json')
            require(prestate == producer['prestate'] and manifest['prestate'] == {
                'file': 'state-prestate.json', 'bytes': prestate['bytes'], 'sha256': prestate['sha256']}
                and 0 < prestate['bytes'] <= 16 * 1024 * 1024
                and isinstance(manifest['chain_id'], str) and manifest['chain_id']
                and manifest['prestate_height'] == 5, 'Original State prestate binding differs')
            original_store = inventory(store)
            require(original_store['files'] == producer['storeBeforeTorii'] and original_store['files'],
                    'Original retained Kura no longer matches the base producer inventory')
            original_trees[str(store)] = original_store
            report['producers'][computation] = dict(producer, inheritedEvidence={
                'baseReport': base_id, 'producerTest': PRODUCER_NAMES[computation],
                'producerCommand': command, 'originalFixtureInventory': original_files,
                'originalStoreInventory': original_store,
                'scope': 'Producer execution and proof are inherited, not rerun by this follow-up'})
        report['qualification'].update(productionToriiCheckInherited=True, selectedNativeTestsInherited=True,
                                       nativeCodecFixtureInherited=True, nativeProducerEvidenceInherited=True)
        stock = report['producers']['stock_race']
        original_fixture = Path(stock['files']['request.nrt']['path']).parent
        owned_store = out / 'exports/retained-stock-kura/kura'
        owned_before = copy_tree(Path(stock['retainedStore']), owned_store,
                                 original_trees[stock['retainedStore']])
        next_fixture = out / 'exports/producer-stock-deadline-n0'
        next_fixture.mkdir(parents=True, exist_ok=False)
        source_manifest = json.loads((original_fixture / 'kura-store.json').read_text())
        for name in stock['files']:
            if name != 'kura-store.json':
                copy_exact(original_fixture / name, next_fixture / name)
        manifest = dict(source_manifest, path=str(owned_store))
        with (next_fixture / 'kura-store.json').open('x') as stream:
            json.dump(manifest, stream, indent=2)
            stream.write('\n')
        rewritten = json.loads((next_fixture / 'kura-store.json').read_text())
        require(dict(rewritten, path=source_manifest['path']) == source_manifest
                and rewritten['path'] == str(owned_store), 'Only the owned Kura path may change')
        copied_files = inventory(next_fixture)
        require(copied_files['directories'] == original_trees[str(original_fixture)]['directories'],
                'Producer fixture directory inventory changed')
        for name, original in stock['files'].items():
            if name != 'kura-store.json':
                require(all(copied_files['files'][name][key] == original[key] for key in ['bytes', 'sha256']),
                        f'Owned producer copy differs: {name}')
        stock.update(files=copied_files['files'], retainedStore=str(owned_store),
                     prestate=copied_files['files']['state-prestate.json'],
                     storeBeforeTorii=owned_before['files'], ownedFixtureInventory=copied_files,
                     ownedStoreBeforeTorii=owned_before,
                     manifestRewrite={'original': stock['inheritedEvidence']['originalFixtureInventory']['files']['kura-store.json'],
                                      'owned': copied_files['files']['kura-store.json'], 'onlyChangedField': 'path'})
        owned_fixture = next_fixture
        persist()
        version, _ = run([TOOLCHAIN / 'rustc', '-vV'], 'compiler-version')
        require(version == base['compilerVersion'] and re.search(r'^release: 1\.93\.1$', version, re.M)
                and 'host: aarch64-apple-darwin' in version, 'The pinned Apple Rust toolchain changed')
        report['compilerVersion'] = version
        report['nativeHead'] = run(['git', 'rev-parse', 'HEAD'], 'native-head')[0].strip()
        report['nativeBranch'] = run(['git', 'symbolic-ref', '--short', 'HEAD'], 'native-branch')[0].strip()
        require(report['nativeHead'] == base['nativeHead']
                and report['nativeBranch'] == base['nativeBranch'] == 'codex/sora-cars-native', 'Native checkout moved')
        text, _ = run([*wrapper, 'test', '--test', 'torii_core_routes', '--no-run', '--locked', '--offline',
                       '-p', 'iroha_torii', '--message-format=json-render-diagnostics'], 'torii-core-routes')
        built = retain_artifact(cargo_messages(text), 'iroha_torii', 'torii_core_routes', 'test', True, 'torii-core-routes')
        report['builds']['torii-core-routes'] = built
        listing, _ = run([built['retainedExecutable']['path'], '--list'], 'torii-core-routes-list')
        names = re.findall(r'^(\S+): test$', listing, re.M)
        require(names == base['builds']['torii-core-routes']['testNames'] and len(names) == len(set(names))
                and {RETAINED_TEST, SERVE_TEST} <= set(names), 'Current emitted test inventory changed')
        built['testNames'] = names
        text, command = run([built['retainedExecutable']['path'], RETAINED_TEST, '--exact', '--test-threads=1', '--nocapture', '--ignored'],
                            FAILED_COMMAND, {'SORA_CARS_REPLAY_TORII_FIXTURE': str(owned_fixture)})
        exact_test_pass(text, RETAINED_TEST)
        report['tests'].append({'name': RETAINED_TEST, 'command': command['name'],
                                'binarySha256': built['retainedExecutable']['sha256'], 'passed': True,
                                'evidence': 'executed in this follow-up against the owned exact Stock copy'})
        report['qualification']['retainedStockToriiReplay'] = True
        text, _ = run([*wrapper, 'build', '--locked', '--offline', '-p', 'iroha_cli', '--bin', 'iroha',
                       '--message-format=json-render-diagnostics'], 'cargo-production-cli')
        report['productionCli'] = retain_artifact(cargo_messages(text), 'iroha_cli', 'iroha', 'bin', False, 'production-cli')
        unchanged()
        report['status'] = 'passed'
    except BaseException as error:
        report.update(status='failed', failure=f'{type(error).__name__}: {error}')
        raise
    finally:
        primary_failure = sys.exception()
        # Original trees remain immutable, including the failed base report and
        # stores. Only the owned Kura is allowed its ordinary reopen journals.
        final_errors = []
        try:
            unchanged()
            report['cleanup']['allPinnedInputsAndOriginalTreesUnchanged'] = True
            if owned_store is not None and owned_before is not None:
                after = inventory(owned_store)
                stock = report['producers']['stock_race']
                stock['ownedStoreAfterTorii'] = after
                stock['storeAfterTorii'] = after['files']
                old_files, new_files = owned_before['files'], after['files']
                stock['storageChangesOnReopen'] = [name for name in sorted(set(old_files) | set(new_files))
                                                   if old_files.get(name) != new_files.get(name)]
                stock['storageDirectoryChangesOnReopen'] = sorted(set(owned_before['directories']) ^ set(after['directories']))
                report['cleanup']['ownedKuraChangesRetainedSeparately'] = True
                require(not any(Path(name).name == 'canonical_association_stage.norito' for name in new_files),
                        'Native endpoint left an unpublished canonical association stage')
        except BaseException as error:
            final_errors.append(f'{type(error).__name__}: {error}')
        report['cleanup']['ownedCommandReaped'] = 'activeProcess' not in report
        if final_errors:
            report['cleanup']['errors'] = final_errors
            report.setdefault('failure', final_errors[0])
            report['status'] = 'failed'
        report['finishedUnixSeconds'] = time.time()
        report['seconds'] = report['finishedUnixSeconds'] - started_at
        try:
            persist()
        except BaseException as persistence_error:
            if primary_failure is None:
                raise
            primary_failure.add_note(f'Final report persistence also failed: {persistence_error}')
            print(f'Final report persistence failed; preserving the primary failure: {persistence_error}', file=sys.stderr)
        finally:
            for sig, handler in old_handlers.items():
                signal.signal(sig, handler)
        print(json.dumps({'status': report['status'], 'report': str(out / 'report.json')}), flush=True)
        if final_errors and primary_failure is None:
            raise RuntimeError('; '.join(final_errors))


if __name__ == '__main__':
    main()
