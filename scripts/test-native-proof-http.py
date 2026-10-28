#!/usr/bin/env python3
"""Exercise the real native HTTP service through the browser SDK and verifier.

Requires a freshly built native CLI and public finalized-game fixture pair.
This does not qualify a funded game, full driving proof or production isolation.
Each output directory is new and retains commands, logs, proof and source hashes.
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time

ACTIVE = None


def persist(output, report):
    temporary = output / 'report.json.tmp'
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(output / 'report.json')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    global ACTIVE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', type=Path, required=True)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--replay', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    native = args.native.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    report = {'status': 'running', 'scope': 'real local native HTTP/SDK integration; unregistered zero-motion fixture',
              'commands': [], 'http': [], 'inputs': {}, 'sources': {}}
    ACTIVE = (output, report)
    persist(output, report)
    report['source_scope'] = 'Selected transport sources only; not complete native build provenance or an independent audit'
    source_paths = [native / 'Cargo.lock', native / 'crates/iroha_cli/Cargo.toml']
    source_paths += list((native / 'crates/iroha_cli/src').glob('execution_worker*.rs'))
    source_paths += [native / 'crates/iroha_cli/src/execution.rs', native / 'crates/iroha_cli/src/main_shared.rs',
                     native / 'crates/iroha_config/src/execution_worker_http.rs', native / 'crates/iroha_config/src/lib.rs']
    source_paths += list((native / 'javascript/iroha_js/src').glob('*game*.*'))
    source_paths += [native / 'javascript/iroha_js/scripts/game-finalized-worker.mjs',
                     native / 'javascript/iroha_js/src/norito.js',
                     native / 'javascript/iroha_js/src/strictLosslessJson.js',
                     native / 'crates/iroha_config/src/execution_worker.rs',
                     native / 'javascript/iroha_js/package.json', Path(__file__).resolve()]
    snapshots = output / 'sources'
    snapshots.mkdir()
    for path in source_paths:
        report['sources'][str(path)] = digest(path)
        target = snapshots / (str(len(report['sources'])) + '-' + path.name)
        shutil.copyfile(path, target)
        assert digest(target) == report['sources'][str(path)] == digest(path), 'source changed while snapshotting'
    for name, source in [('request.nrt', args.request.resolve()), ('replay.nrt', args.replay.resolve())]:
        before = digest(source)
        shutil.copyfile(source, output / name)
        assert before == digest(output / name) == digest(source), 'public input changed while copying'
        report['inputs'][name] = {'source': str(source), 'sha256': digest(output / name), 'bytes': (output / name).stat().st_size}
    executable = output / 'iroha'
    shutil.copyfile(native / 'target/debug/iroha', executable)
    executable.chmod(0o500)
    report['binary'] = {'source': str(native / 'target/debug/iroha'), 'sha256': digest(executable), 'bytes': executable.stat().st_size}
    spool = output / 'spool'
    spool.mkdir(mode=0o700)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    config = output / 'worker.toml'
    config.write_text(f'''listen = "127.0.0.1:{port}"
allowed_origins = ["http://127.0.0.1:5173"]
allowed_authorities = ["127.0.0.1:{port}"]
result_ttl_ms = 60000
download_timeout_ms = 30000
shutdown_grace_ms = 1000
connections = 8
[worker]
spool_dir = "{spool}"
upload_timeout_ms = 30000
job_timeout_ms = 180000
replay_bytes = 131072
proof_bytes = 524288
''')
    server = None
    server_out = (output / 'server.stdout').open('wb')
    server_err = (output / 'server.stderr').open('wb')

    def request(label, method, path, expected, body=None, headers=None):
        client = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        try:
            client.request(method, path, body=body, headers=headers or {})
            response = client.getresponse()
            content = response.read(65537)
            assert len(content) <= 65536, 'unbounded control response'
            record = {'label': label, 'method': method, 'path': path, 'status': response.status,
                      'headers': dict(response.getheaders()), 'body': content.decode()}
            report['http'].append(record)
            assert response.status == expected, record
            assert response.getheader('Cache-Control') == 'no-store', record
            assert response.getheader('X-Content-Type-Options') == 'nosniff', record
            assert response.getheader('Access-Control-Allow-Credentials') is None, record
            return json.loads(content) if content else None
        finally:
            client.close()

    def command(label, argv, timeout=240):
        started = time.monotonic()
        receipt = {'label': label, 'argv': list(map(str, argv)), 'status': 'starting'}
        report['commands'].append(receipt)
        persist(output, report)
        child = None
        try:
            with (output / f'{label}.stdout').open('wb') as stdout, (output / f'{label}.stderr').open('wb') as stderr:
                child = subprocess.Popen(receipt['argv'], cwd=output, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
                receipt.update(pid=child.pid, status='running')
                persist(output, report)
                try:
                    code = child.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    receipt['timeout'] = True
                    child.send_signal(signal.SIGTERM)
                    # Wait for this owned command; never detach it or signal Cargo.
                    code = child.wait()
                receipt.update(exit=code, status='finished')
            assert code == 0 and not receipt.get('timeout'), f'{label} failed; inspect retained logs'
        except BaseException as error:
            receipt['error'] = str(error)
            if child is not None and child.poll() is None:
                child.send_signal(signal.SIGTERM)
                receipt['exit_after_cleanup'] = child.wait()
            raise
        finally:
            receipt['seconds'] = time.monotonic() - started
            persist(output, report)

    try:
        argv = [str(executable), 'app', 'execution', 'serve-finalized', '--worker-config', str(config)]
        server = subprocess.Popen(argv, cwd=output, stdin=subprocess.DEVNULL, stdout=server_out, stderr=server_err)
        report['server'] = {'argv': argv, 'pid': server.pid, 'origin': origin}
        deadline = time.monotonic() + 30
        while True:
            assert server.poll() is None, 'native server exited before readiness'
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    break
            except OSError:
                assert time.monotonic() < deadline, 'listener readiness timeout'
                time.sleep(.05)
        request('closed_old_route', 'POST', '/v1/proofs', 404)
        request('wrong_origin', 'POST', '/v1/jobs', 403, headers={'Origin': 'https://other.example'})
        request('wrong_host', 'POST', '/v1/jobs', 403, headers={'Host': 'other.example'})
        request('query_rejected', 'GET', '/v1/jobs?x=1', 400)
        request('invalid_native_request', 'POST', '/v1/jobs', 400, b'invalid', {'Content-Type': 'application/octet-stream'})
        request('preflight', 'OPTIONS', '/v1/jobs', 204, headers={'Origin': 'http://127.0.0.1:5173',
                'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
        request('unknown_id', 'GET', '/v1/jobs/' + 'a' * 64, 404)
        with socket.create_connection(('127.0.0.1', port), timeout=5) as client:
            client.sendall(f'POST /v1/jobs HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\nx'.encode())
            try:
                closed = client.recv(1024)
            except ConnectionResetError:
                closed = b''
            assert not closed, 'duplicate Content-Length reached application'
            report['raw_duplicate_length_closed'] = True
        job = request('reservation', 'POST', '/v1/jobs', 202, (output / 'request.nrt').read_bytes(),
                      {'Content-Type': 'application/octet-stream'})
        request('occupied', 'POST', '/v1/jobs', 409, (output / 'request.nrt').read_bytes(),
                {'Content-Type': 'application/octet-stream'})
        request('cancel_reservation', 'DELETE', job['status_path'], 202)
        time.sleep(.05)
        node = shutil.which('node')
        assert node, 'node runtime unavailable'
        command('sdk-native-proof', [node, native / 'javascript/iroha_js/scripts/game-finalized-worker.mjs',
                origin, output / 'request.nrt', output / 'replay.nrt', output / 'proof.bin', output / 'worker-report.json'])
        command('independent-native-verify', [executable, 'app', 'execution', 'verify-finalized',
                '--request', output / 'request.nrt', '--replay', output / 'replay.nrt', '--proof', output / 'proof.bin'])
        worker_report = json.loads((output / 'worker-report.json').read_text())
        verified = json.loads((output / 'independent-native-verify.stdout').read_text())
        assert worker_report == verified, 'SDK report changed or native independent verifier disagreed'
        for flag in ['profile_registered', 'settlement_verified', 'composed_security_qualified', 'latest_freshness_verified', 'removal_transitions_replayed']:
            assert verified[flag] is False, f'qualification upgraded: {flag}'
        assert verified['record_finality_verified'] is True and verified['computation_verified'] is True
        assert verified['proof_bytes'] == (output / 'proof.bin').stat().st_size
        report['proof'] = {'sha256': digest(output / 'proof.bin'), 'bytes': verified['proof_bytes'], 'report': verified}
        report['status'] = 'passed'
    except BaseException as error:
        report['status'] = 'failed'
        report['failure'] = str(error)
        raise
    finally:
        if server is not None:
            if server.poll() is None:
                server.send_signal(signal.SIGTERM)
            try:
                report['server']['exit'] = server.wait(timeout=60)
            except subprocess.TimeoutExpired:
                report['status'] = 'failed'
                report['server']['still_running'] = True
                report['failure'] = 'Owned native server has not completed cleanup; inspect retained PID'
        server_out.close()
        server_err.close()
        report['spool_entries'] = sorted(path.name for path in spool.iterdir())
        if report['status'] == 'passed':
            if report['server'].get('exit') != 0 or report['spool_entries'] != ['.public-proof-worker.lock']:
                report['status'] = 'failed'
                report['failure'] = 'server shutdown or native spool cleanup failed'
        report['source_drift'] = []
        for path in source_paths:
            try:
                if digest(path) != report['sources'][str(path)]:
                    report['source_drift'].append(str(path))
            except OSError as error:
                report['source_drift'].append({'path': str(path), 'error': str(error)})
        if report['source_drift']:
            report['status'] = 'failed'
        persist(output, report)
        print(json.dumps({'status': report['status'], 'report': str(output / 'report.json')}, indent=2))
    if report['status'] != 'passed':
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        if ACTIVE is not None:
            output, report = ACTIVE
            report['status'] = 'failed'
            report['failure'] = str(error)
            persist(output, report)
        raise
