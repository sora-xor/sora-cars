#!/usr/bin/env python3
"""Qualify the frozen native binary Accept correction in a new evidence lane.

The passed CORS-only follow-up, its failed original base, and the actual HTTP406
Chromium attempt remain immutable. Their tests/producers are inherited, not run
again. This runner builds and tests current Torii negotiation/transport, exercises
the shipping retained Stock endpoint with Accept, then builds a current CLI.
Only owned exact copies of public Stock evidence and retained Kura are opened.
No browser run, live stakes, full-race, four-validator or security claim follows.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import types

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT.parent / 'iroha-sora-cars-native'
TOOLCHAIN = Path('/Users/takemiyamakoto/.rustup/toolchains/1.93.1-aarch64-apple-darwin/bin')
RETAINED_TEST = 'game_replay_retained_endpoint::retained_native_export_matches_original_public_bundle'
SERVE_TEST = 'game_replay_retained_endpoint::serve_retained_native_export_for_browser'
NEGOTIATION_PREFIX = 'response_negotiation_middleware_tests::'
GAME_PREFIX = 'game_replay::tests::'
# Exact reviewed patch 5b5137d14dad5bc53139ddbdeb5c0628dbd6b8821b0379fcd080b9928b6de13e.
APPROVED_NATIVE = {
    'crates/iroha_torii/src/lib.rs': {
        'beforeSha256': 'a06dfbd960458b7df2731f490bda12e011a221657bdb48e0341b70111464032e',
        'afterSha256': 'ceaae055c7ad4f99938b6d45ee78555d22b9502302154a10a4b53e431e60178b',
    },
    'crates/iroha_torii/tests/game_replay_retained_endpoint.rs': {
        'beforeSha256': 'b6344e50621ee9d06ca8515a0c332b6ee099bbb868847f5215775f1db1d48fa0',
        'afterSha256': 'cb4a37d1fda100b4883c622942c8ed8c51ed65aa8a72815814504b8f38a5fdee',
    },
}
# Reviewed post-follow-up documentation only; not part of the Rust Accept fix.
APPROVED_PROSE = {
    'specs/game_replay_export.md': {
        'beforeSha256': '873f1366e9c19e444b20e9add24c4aae4dccbc163dbb3168610eac13c6447ae6',
        'afterSha256': '6c96f56c07384b961f993ca952fa8d5e57bc645469c789a786d6f4413bc93419',
    },
}
EXPECTED_NEGOTIATION_TESTS = [NEGOTIATION_PREFIX + name for name in [
    'duplicate_content_type_is_rejected_before_command_handler',
    'game_replay_binary_accept_preserves_content_type_errors',
    'game_replay_binary_accept_preserves_exact_body_and_headers',
    'game_replay_binary_accept_preserves_typed_failures',
    'game_replay_binary_accept_rejects_before_handler_work',
    'game_replay_binary_accept_requires_exact_cataloged_post',
    'game_replay_binary_accept_still_validates_success_media',
    'handler_panic_becomes_typed_internal_error',
    'non_ascii_repeated_accept_field_fails_closed',
    'protocol_stream_establishment_errors_remain_typed_json',
    'public_conditional_get_rejects_unacceptable_media_before_a_304_handler',
    'repeated_accept_fields_are_combined_before_negotiation',
    'route_timeout_error_is_private_and_not_cacheable',
    'safe_protocol_native_media_bypasses_typed_negotiation',
    'safe_protocol_native_media_rejects_an_explicit_mismatch',
    'safe_typed_response_still_rejects_unacceptable_media',
    'unsafe_command_is_rejected_before_handler_side_effects',
]]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_print(value, *, error=None, stream=None):
    """Terminal diagnostics must never replace a primary failure or its receipt."""
    try:
        print(value, file=stream or sys.stdout, flush=True)
    except (BrokenPipeError, OSError) as diagnostic_error:
        if error is not None:
            error.add_note(f'Terminal diagnostic unavailable: {diagnostic_error}')


def read_pinned_json(path, cap=16 * 1024 * 1024):
    require(path.is_absolute() and path.is_file() and not path.is_symlink(), 'Absolute regular report required')
    raw = path.read_bytes()
    require(0 < len(raw) <= cap, 'Report size is outside the explicit bound')
    row = {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    return json.loads(raw), row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--iroha-root', required=True, type=Path)
    parser.add_argument('--base-report', required=True, type=Path, help='Passed CORS-only follow-up report')
    parser.add_argument('--browser-report', required=True, type=Path, help='Original failed native HTTP406 browser report')
    parser.add_argument('--lane', required=True, help='native-game-replay-accept-attempt-N (create-only)')
    args = parser.parse_args()
    require(sys.platform == 'darwin' and args.iroha_root.is_absolute()
            and args.iroha_root.resolve(strict=True) == NATIVE, 'Exact isolated Apple native worktree required')
    require(APPROVED_NATIVE and EXPECTED_NEGOTIATION_TESTS, 'Accept correction has not been frozen for execution')
    require(re.fullmatch(r'native-game-replay-accept-attempt-[1-9][0-9]*', args.lane), 'Invalid fresh evidence lane')
    for path, pattern in [(args.base_report, r'native-game-replay-followup-attempt-[1-9][0-9]*'),
                          (args.browser_report, r'native-stock-replay-browser-attempt-[1-9][0-9]*')]:
        require(path.is_absolute() and path.name == 'report.json'
                and path.parent.parent == ROOT / 'output/qualification'
                and re.fullmatch(pattern, path.parent.name), 'Explicit prior qualification report required')
    base, base_id = read_pinned_json(args.base_report)
    browser, browser_id = read_pinned_json(args.browser_report)
    require(base['schema'] == 'sora-cars.native-game-replay-followup.v1' and base['status'] == 'passed'
            and base['nativeRoot'] == str(NATIVE), 'A passed original CORS follow-up is required')
    helper = args.base_report.parent / 'source/followup-runner.py'
    helper_row = base['snapshots'][str(helper)]
    helper_bytes = helper.read_bytes()
    require(len(helper_bytes) == helper_row['bytes']
            and hashlib.sha256(helper_bytes).hexdigest() == helper_row['sha256'], 'Retained helper snapshot changed')
    # Reuse the exact reviewed pure helpers, never the old main or working copy.
    policy = types.ModuleType('retained_followup_helpers')
    policy.__file__ = str(helper)
    exec(compile(helper_bytes, str(helper), 'exec'), policy.__dict__)
    identity, copy_exact, inventory = policy.identity, policy.copy_exact, policy.inventory
    copy_tree, exact_test_pass, cargo_messages = policy.copy_tree, policy.exact_test_pass, policy.cargo_messages
    target = NATIVE / 'target'
    require(target.is_dir() and base['warmTarget'] == str(target), 'Same existing warm native target required')
    if os.environ.get('CARGO_TARGET_DIR'):
        require(Path(os.environ['CARGO_TARGET_DIR']).resolve() == target, 'Unexpected target override')
    prohibited = {'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTDOCFLAGS', 'CARGO_ENCODED_RUSTDOCFLAGS',
                  'RUSTC_WORKSPACE_WRAPPER', 'RUSTC_WRAPPER', 'RUSTC_BOOTSTRAP', 'RUSTC', 'RUSTDOC',
                  'RUSTUP_TOOLCHAIN', 'CARGO_HOME', 'CARGO_INCREMENTAL', 'CARGO_FAST_TARGET_ROOT', 'VERGEN_GIT_SHA'}
    for name, value in os.environ.items():
        if name != 'CARGO_TARGET_DIR' and (name in prohibited or name.startswith(
                ('CARGO_PROFILE_', 'CARGO_TARGET_', 'CARGO_BUILD_', 'SORA_CARS_'))):
            require(not value, f'Unrecorded build/test override: {name}')
    out = ROOT / 'output/qualification' / args.lane
    out.mkdir(parents=True, exist_ok=False)
    report = {
        'schema': 'sora-cars.native-game-replay-accept.v1', 'status': 'running',
        'nativeRoot': str(NATIVE), 'warmTarget': str(target), 'sources': {}, 'snapshots': {},
        'inheritedInputs': {}, 'tools': {}, 'outputs': {}, 'commands': [], 'builds': {},
        'inheritedTests': [], 'tests': [], 'producers': {}, 'cleanup': {},
        'scope': 'Current native binary Accept negotiation/transport and retained Stock endpoint; '
                 'previous 29 tests plus CORS endpoint and two synthetic zero-motion producers are inherited. '
                 'Fresh production CLI after tests. No browser execution or complete native build provenance.',
        'qualification': {'binaryAcceptNegotiation': False, 'currentGameReplayTests': False,
                          'productionToriiCheck': False, 'retainedStockToriiReplay': False,
                          'retainedStreetToriiReplay': False, 'fourValidators': False,
                          'admittedLifecycle': False, 'fullRace': False, 'composedSecurity': False,
                          'liveStakes': False, 'deployment': False},
        'startedUnixSeconds': time.time(),
    }
    interrupted, original_trees = [], {}
    owned_fixture = owned_store = owned_before = None
    env = dict(os.environ)
    env.update(PATH=str(TOOLCHAIN) + os.pathsep + env.get('PATH', ''), RUSTC=str(TOOLCHAIN / 'rustc'),
               RUSTDOC=str(TOOLCHAIN / 'rustdoc'), CARGO_TARGET_DIR=str(target), GIT_OPTIONAL_LOCKS='0')
    report['environment'] = {key: env[key] for key in ['PATH', 'RUSTC', 'RUSTDOC', 'CARGO_TARGET_DIR', 'GIT_OPTIONAL_LOCKS']}
    wrapper = ['/bin/bash', NATIVE / 'scripts/cargo_fast.sh', '--stable-local-metadata',
               '--no-incremental', '--linker', 'off', '--']

    def persist():
        temporary, owned = out / f'report-{time.monotonic_ns()}.json.tmp', None
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
                    require((current.st_dev, current.st_ino) == owned, 'Report temporary was replaced; preserve it')
                    temporary.unlink()
                except FileNotFoundError:
                    pass
                except BaseException as cleanup_error:
                    error.add_note(f'Owned temporary cleanup also failed: {cleanup_error}')
            raise

    def on_signal(number, _frame):
        interrupted.append(number)
        report['interruptionRequested'] = interrupted[:]

    old_handlers = {sig: signal.signal(sig, on_signal) for sig in [signal.SIGINT, signal.SIGTERM]}

    def pin(row, group='inheritedInputs'):
        require(identity(row['path']) == row, f'Pinned evidence changed: {row["path"]}')
        report[group][row['path']] = row

    def unchanged():
        for group in ['sources', 'snapshots', 'inheritedInputs', 'tools', 'outputs']:
            for path, expected in report[group].items():
                require(identity(path) == expected, f'Frozen input changed: {path}')
        for path, expected in original_trees.items():
            require(inventory(Path(path)) == expected, f'Original retained tree changed: {path}')
        for built in list(report['builds'].values()) + ([report['productionCli']] if 'productionCli' in report else []):
            row = built['retainedExecutable']
            require(identity(row['path']) == row, 'Current retained executable changed')
        if owned_fixture is not None:
            require(inventory(owned_fixture) == report['producers']['stock_race']['ownedFixtureInventory'],
                    'Owned public producer inputs changed')

    def run(argv, label, extra_env=None):
        require(not interrupted, 'Interrupted before next owned command')
        unchanged()
        argv = [str(value) for value in argv]
        receipt = {'name': label, 'argv': argv, 'cwd': str(NATIVE), 'extraEnvironment': extra_env or {},
                   'status': 'starting', 'startedUnixSeconds': time.time()}
        report['commands'].append(receipt)
        persist()
        stdout, stderr = out / f'{label}.stdout', out / f'{label}.stderr'
        started, command_error = time.monotonic(), None
        try:
            with stdout.open('xb') as a, stderr.open('xb') as b:
                child = subprocess.Popen(argv, cwd=NATIVE, env=dict(env, **(extra_env or {})),
                                         stdin=subprocess.DEVNULL, stdout=a, stderr=b, start_new_session=True)
                receipt.update(pid=child.pid, status='running')
                report['activeProcess'] = {'pid': child.pid, 'command': label}
                try:
                    persist()
                    safe_print(f'{label}: pid {child.pid}')
                    while True:
                        try:
                            code = child.wait(timeout=30)
                            break
                        except subprocess.TimeoutExpired:
                            receipt['elapsedSeconds'] = time.monotonic() - started
                            persist()
                            safe_print(f'{label}: same owned process {child.pid} remains live')
                finally:
                    # Preserve the native corridor: never abandon or signal an
                    # owned Cargo command because a diagnostic failed.
                    if child.poll() is None:
                        child.wait()
                    report.pop('activeProcess', None)
                    receipt.update(status='finished', exitCode=child.returncode, childReaped=True,
                                   seconds=time.monotonic() - started)
            require(code == 0, f'{label} failed with {code}; retained logs are authoritative')
        except BaseException as error:
            command_error = error
            raise
        finally:
            errors = []
            for channel, path in [('stdout', stdout), ('stderr', stderr)]:
                try:
                    row = identity(path)
                    receipt[channel] = row
                    pin(row, 'outputs')
                except BaseException as error:
                    errors.append(f'{channel}: {type(error).__name__}: {error}')
            if errors:
                receipt['logCaptureErrors'] = errors
                if command_error is not None:
                    command_error.add_note('Log capture also failed: ' + '; '.join(errors))
                else:
                    raise RuntimeError('; '.join(errors))
        persist()
        require(not interrupted, 'Interrupted; exact owned command completed without being signalled')
        unchanged()
        return stdout.read_text(), receipt

    def retain_artifact(messages, target_name, kind, test, label, package='iroha_torii'):
        candidates = [m for m in messages if m.get('reason') == 'compiler-artifact'
                      and m.get('manifest_path') == str(NATIVE / 'crates' / package / 'Cargo.toml')
                      and m['target']['name'] == target_name and kind in m['target']['kind']
                      and m['profile']['test'] is test and m.get('executable')]
        require(len(candidates) == 1, f'One current emitted Cargo artifact required: {label}')
        binary = Path(candidates[0]['executable']).resolve(strict=True)
        require(binary.is_relative_to(target), 'Cargo artifact escaped the warm target')
        emitted, retained = copy_exact(binary, out / 'binaries' / label)
        Path(retained['path']).chmod(0o500)
        return {'artifact': candidates[0], 'emittedExecutable': emitted, 'retainedExecutable': retained}

    def build_tests(label, target_name, kind, selector):
        text, _ = run([*wrapper, 'test', *selector, '--no-run', '--locked', '--offline', '-p', 'iroha_torii',
                       '--message-format=json-render-diagnostics'], label)
        built = retain_artifact(cargo_messages(text), target_name, kind, True, label)
        report['builds'][label] = built
        listing, _ = run([built['retainedExecutable']['path'], '--list'], label + '-list')
        names = re.findall(r'^(\S+): test$', listing, re.M)
        require(names and len(names) == len(set(names)), 'Unique nonempty current test inventory required')
        built['testNames'] = names
        return built

    def test_one(built, name, label, extra_env=None, ignored=False):
        require(name in built['testNames'], f'Missing emitted exact native test: {name}')
        argv = [built['retainedExecutable']['path'], name, '--exact', '--test-threads=1', '--nocapture']
        if ignored:
            argv.append('--ignored')
        text, command = run(argv, label, extra_env)
        exact_test_pass(text, name)
        report['tests'].append({'name': name, 'command': command['name'], 'passed': True,
                                'binarySha256': built['retainedExecutable']['sha256'], 'evidence': 'executed in this run'})
        persist()

    try:
        pin(base_id)
        pin(browser_id)
        for source, name in [(args.base_report, 'prior-followup-report.json'),
                             (args.browser_report, 'prior-browser-report.json')]:
            _, copied = copy_exact(source, out / name)
            pin(copied, 'snapshots')
        report['priorEvidence'] = {'followup': base_id, 'followupStatus': 'passed', 'browser': browser_id,
                                   'browserStatus': 'failed', 'originalBase': base['baseEvidence']}
        require(all(base['cleanup'].get(key) is True for key in ['allPinnedInputsAndOriginalTreesUnchanged',
                    'ownedKuraChangesRetainedSeparately', 'ownedCommandReaped']), 'Prior follow-up cleanup did not complete')
        require(base['qualification']['retainedStockToriiReplay'] is True
                and base['qualification']['retainedStreetToriiReplay'] is False,
                'Prior native endpoint scope differs')
        require(base['baseEvidence']['status'] == 'failed' and len(base['inheritedTests']) == 29
                and len(base['tests']) == 1 and base['tests'][0]['name'] == RETAINED_TEST,
                'Exact original failed base and 29 + 1 inherited tests required')
        for group in ['snapshots', 'inheritedInputs', 'outputs']:
            for row in base[group].values():
                pin(row)
        for row in base['tools'].values():
            pin(row, 'tools')
        require(set(base['tools']) == {str(TOOLCHAIN / name) for name in ['cargo', 'rustc', 'rustdoc']},
                'Exact pinned Rust tools required')
        prior_commands = {row['name']: row for row in base['commands']}
        require(len(prior_commands) == len(base['commands']) == 7
                and all(row['status'] == 'finished' and row['exitCode'] == 0 and row['cwd'] == str(NATIVE)
                        for row in base['commands']), 'All seven original follow-up commands must have passed')
        for built in [base['builds']['torii-core-routes'], base['productionCli']]:
            pin(built['retainedExecutable'])
        previous_test = base['tests'][0]
        previous_command = prior_commands[previous_test['command']]
        previous_binary = base['builds']['torii-core-routes']['retainedExecutable']
        require(previous_test['passed'] is True and previous_test['binarySha256'] == previous_binary['sha256']
                and previous_command['argv'] == [previous_binary['path'], RETAINED_TEST, '--exact', '--test-threads=1', '--nocapture', '--ignored'],
                'Original endpoint test/executable association differs')
        exact_test_pass(Path(previous_command['stdout']['path']).read_text(), RETAINED_TEST)
        for test in base['inheritedTests'] + base['tests']:
            require(test['passed'] is True, 'A required inherited test did not pass')
            report['inheritedTests'].append(dict(test, inheritedFrom=base_id))
        report['inheritedBuilds'] = {'followup': base['builds'], 'productionCli': base['productionCli']}
        require(browser['schema'] == 'sora-cars.native-replay-browser.v1' and browser['status'] == 'failed'
                and browser['computation'] == 'stock_race' and not browser['source_drift'],
                'The original failed native Stock browser receipt is required')
        require(browser['binary']['sha256'] == base['productionCli']['retainedExecutable']['sha256']
                and browser['torii_binary']['sha256'] == previous_binary['sha256'], 'Browser receipt used different binaries')
        failures = [row for scenario in browser['scenarios'] for row in scenario['responses']
                    if row.get('method') == 'POST' and row.get('path') == '/v1/games/replay' and row.get('status') == 406]
        requests = [row for scenario in browser['scenarios'] for row in scenario['requests']
                    if row.get('method') == 'POST' and row.get('path') == '/v1/games/replay']
        require(len(failures) == len(requests) == 1 and requests[0]['headers']['accept'] == 'application/octet-stream',
                'Actual binary Accept HTTP406 evidence required')
        report['priorEvidence']['browserHttpFailure'] = failures[0]
        prior_processes = {row['label']: row for row in browser['processes']}
        require(len(prior_processes) == len(browser['processes']) == 3
                and set(prior_processes) == {'native-torii', 'native-worker', 'vite'},
                'Exact owned browser process roles required')
        require(browser['torii_stopped']['graceful'] is True
                and all(row['status'] == 'finished' and row['signal'] is None
                        and isinstance(row.get('stop_requested_at'), str) for row in prior_processes.values())
                and all(prior_processes[role]['exit'] == 0 for role in ['native-torii', 'native-worker'])
                and prior_processes['vite']['exit'] in (0, 143)
                and prior_processes['vite']['argv'][1] == str(ROOT / 'node_modules/vite/bin/vite.js')
                and prior_processes['vite']['cwd'] == str(ROOT)
                and not browser.get('cleanup_errors'), 'Failed browser attempt did not shut down cleanly')
        for name, row in browser['inputs'].items():
            expected = {'path': row['source'], 'bytes': row['bytes'], 'sha256': row['sha256']}
            pin(expected)
        native_sources = {str(Path(path).relative_to(NATIVE)): row for path, row in base['sources'].items()
                          if Path(path).is_relative_to(NATIVE)}
        require(len(native_sources) == 59, 'Prior native selected-source inventory differs')
        report['approvedNativeChanges'] = APPROVED_NATIVE
        report['approvedDocumentationChanges'] = APPROVED_PROSE
        approved_sources = APPROVED_NATIVE | APPROVED_PROSE
        for name in sorted(set(native_sources) | set(approved_sources)):
            source = NATIVE / name
            current = identity(source)
            if name in approved_sources:
                allowed = approved_sources[name]
                require(current['sha256'] == allowed['afterSha256'], f'Unapproved current source bytes: {name}')
                if name in native_sources:
                    baseline = args.base_report.parent / 'source/native' / name
                    require(native_sources[name]['sha256'] == allowed['beforeSha256'], 'Prior source pin differs')
                else:
                    baseline = Path(allowed['baselineFile'])
                before = identity(baseline)
                require(before['sha256'] == allowed['beforeSha256'], f'Approved pre-edit source differs: {name}')
                pin(before)
                _, copied_baseline = copy_exact(baseline, out / 'source/approved-before' / name)
                pin(copied_baseline, 'snapshots')
            else:
                require(current == native_sources[name], f'Unapproved native source change: {name}')
            before, copied = copy_exact(source, out / 'source/native' / name)
            pin(before, 'sources')
            pin(copied, 'snapshots')
        before, copied = copy_exact(Path(__file__).resolve(), out / 'source/accept-runner.py')
        pin(before, 'sources')
        pin(copied, 'snapshots')
        for computation, producer in base['producers'].items():
            fixture_dir = Path(producer['files']['request.nrt']['path']).parent
            tree = inventory(fixture_dir)
            require(tree['files'] == producer['files'], 'Inherited public producer fixture changed')
            original_trees[str(fixture_dir)] = tree
            store = Path(producer['retainedStore'])
            retained = inventory(store)
            expected = producer.get('ownedStoreAfterTorii') or producer['inheritedEvidence']['originalStoreInventory']
            require(retained == expected, 'Inherited retained Kura inventory changed')
            original_trees[str(store)] = retained
            report['producers'][computation] = dict(producer, acceptedRunInheritance={
                'baseReport': base_id, 'originalFixture': str(fixture_dir), 'originalStore': str(store),
                'originalFixtureInventory': tree, 'originalStoreInventory': retained,
                'scope': 'Genuine native producer evidence inherited unchanged; not reexecuted'})
        stock = report['producers']['stock_race']
        original_fixture, original_store = Path(stock['files']['request.nrt']['path']).parent, Path(stock['retainedStore'])
        manifest = json.loads((original_fixture / 'kura-store.json').read_text())
        prestate = identity(original_fixture / 'state-prestate.json')
        require(manifest['version'] == 1 and manifest['path'] == str(original_store)
                and manifest['computation']['kind'] == 'stock_race' and manifest['restored'] is True
                and manifest['prestate'] == {'file': 'state-prestate.json', 'bytes': prestate['bytes'], 'sha256': prestate['sha256']}
                and prestate == stock['prestate'] and 0 < prestate['bytes'] <= 16 * 1024 * 1024
                and isinstance(manifest['chain_id'], str) and manifest['chain_id'] and manifest['prestate_height'] == 5,
                'Exact original admitted Stock prestate and pinned context required')
        owned_store = out / 'exports/retained-stock-kura/kura'
        owned_before = copy_tree(original_store, owned_store, original_trees[str(original_store)])
        destination = out / 'exports/producer-stock-deadline-n0'
        destination.mkdir(parents=True, exist_ok=False)
        for name in stock['files']:
            if name != 'kura-store.json':
                copy_exact(original_fixture / name, destination / name)
        with (destination / 'kura-store.json').open('x') as stream:
            json.dump(dict(manifest, path=str(owned_store)), stream, indent=2)
            stream.write('\n')
        rewritten = json.loads((destination / 'kura-store.json').read_text())
        require(rewritten['path'] == str(owned_store) and dict(rewritten, path=manifest['path']) == manifest,
                'Only the copied manifest Kura path may change')
        copied_tree = inventory(destination)
        require(set(copied_tree['files']) == set(stock['files'])
                and copied_tree['directories'] == original_trees[str(original_fixture)]['directories'],
                'Owned fixture inventory differs')
        for name in stock['files']:
            if name != 'kura-store.json':
                require(all(stock['files'][name][key] == copied_tree['files'][name][key] for key in ['bytes', 'sha256']),
                        f'Copied native public bytes differ: {name}')
        stock.update(files=copied_tree['files'], retainedStore=str(owned_store),
                     prestate=copied_tree['files']['state-prestate.json'], ownedFixtureInventory=copied_tree,
                     storeBeforeTorii=owned_before['files'], ownedStoreBeforeTorii=owned_before,
                     manifestRewrite={'onlyChangedField': 'path', 'original': stock['acceptedRunInheritance']['originalFixtureInventory']['files']['kura-store.json'],
                                      'owned': copied_tree['files']['kura-store.json']})
        owned_fixture = destination
        version, _ = run([TOOLCHAIN / 'rustc', '-vV'], 'compiler-version')
        require(version == base['compilerVersion'] and re.search(r'^release: 1\.93\.1$', version, re.M)
                and 'host: aarch64-apple-darwin' in version, 'Exact pinned Apple Rust compiler required')
        report['compilerVersion'] = version
        report['nativeHead'] = run(['git', 'rev-parse', 'HEAD'], 'native-head')[0].strip()
        report['nativeBranch'] = run(['git', 'symbolic-ref', '--short', 'HEAD'], 'native-branch')[0].strip()
        require(report['nativeHead'] == base['nativeHead']
                and report['nativeBranch'] == base['nativeBranch'] == 'codex/sora-cars-native', 'Native checkout moved')
        lib = build_tests('torii-libtest', 'iroha_torii', 'lib', ['--lib'])
        negotiation = [name for name in lib['testNames'] if name.startswith(NEGOTIATION_PREFIX)]
        game = [name for name in lib['testNames'] if name.startswith(GAME_PREFIX)]
        require(negotiation == EXPECTED_NEGOTIATION_TESTS and len(negotiation) == len(set(negotiation)),
                'Exact full response-negotiation test scope differs')
        original_game = [name for name in base['inheritedBuilds']['torii-libtest']['testNames'] if name.startswith(GAME_PREFIX)]
        require(game == original_game and game, 'Existing complete game replay test scope changed')
        report['selectedTests'] = {'negotiation': negotiation, 'gameReplay': game}
        for index, name in enumerate(negotiation + game, 1):
            test_one(lib, name, f'torii-native-{index:02d}')
        report['qualification'].update(binaryAcceptNegotiation=True, currentGameReplayTests=True)
        cargo_messages(run([*wrapper, 'check', '--locked', '--offline', '-p', 'iroha_torii', '--lib',
                            '--message-format=json-render-diagnostics'], 'cargo-production-torii-check')[0])
        report['qualification']['productionToriiCheck'] = True
        routes = build_tests('torii-core-routes', 'torii_core_routes', 'test', ['--test', 'torii_core_routes'])
        require(routes['testNames'] == base['builds']['torii-core-routes']['testNames']
                and {RETAINED_TEST, SERVE_TEST} <= set(routes['testNames']), 'Retained endpoint inventory changed')
        test_one(routes, RETAINED_TEST, 'retained-stock-binary-accept',
                 {'SORA_CARS_REPLAY_TORII_FIXTURE': str(owned_fixture)}, ignored=True)
        report['qualification']['retainedStockToriiReplay'] = True
        text, _ = run([*wrapper, 'build', '--locked', '--offline', '-p', 'iroha_cli', '--bin', 'iroha',
                       '--message-format=json-render-diagnostics'], 'cargo-production-cli')
        report['productionCli'] = retain_artifact(cargo_messages(text), 'iroha', 'bin', False, 'production-cli', 'iroha_cli')
        unchanged()
        report['status'] = 'passed'
    except BaseException as error:
        report.update(status='failed', failure=f'{type(error).__name__}: {error}')
        raise
    finally:
        primary, cleanup_errors = sys.exception(), []
        try:
            unchanged()
            report['cleanup']['allPinnedInputsAndOriginalTreesUnchanged'] = True
        except BaseException as error:
            cleanup_errors.append(f'Frozen inputs: {type(error).__name__}: {error}')
        if owned_store is not None and owned_before is not None:
            try:
                after = inventory(owned_store)
                stock = report['producers']['stock_race']
                stock['ownedStoreAfterTorii'] = after
                stock['storeAfterTorii'] = after['files']
                stock['storageChangesOnReopen'] = [name for name in sorted(set(owned_before['files']) | set(after['files']))
                                                   if owned_before['files'].get(name) != after['files'].get(name)]
                stock['storageDirectoryChangesOnReopen'] = sorted(set(owned_before['directories']) ^ set(after['directories']))
                require(not any(Path(name).name == 'canonical_association_stage.norito' for name in after['files']),
                        'Native endpoint left unpublished canonical association state')
                report['cleanup']['ownedKuraChangesRetainedSeparately'] = True
            except BaseException as error:
                cleanup_errors.append(f'Owned Kura: {type(error).__name__}: {error}')
        report['cleanup']['ownedCommandReaped'] = 'activeProcess' not in report
        if cleanup_errors:
            report['status'] = 'failed'
            report['cleanup']['errors'] = cleanup_errors
            report.setdefault('failure', cleanup_errors[0])
        report['finishedUnixSeconds'] = time.time()
        report['seconds'] = report['finishedUnixSeconds'] - report['startedUnixSeconds']
        try:
            persist()
        except BaseException as persistence_error:
            if primary is None:
                raise
            primary.add_note(f'Final report persistence also failed: {persistence_error}')
            safe_print(f'Final report persistence failed: {persistence_error}', error=primary, stream=sys.stderr)
        finally:
            for sig, handler in old_handlers.items():
                signal.signal(sig, handler)
        safe_print(json.dumps({'status': report['status'], 'report': str(out / 'report.json')}), error=primary)
        if cleanup_errors and primary is None:
            raise RuntimeError('; '.join(cleanup_errors))


if __name__ == '__main__':
    main()
