#!/usr/bin/env python3
"""Check the execution constants and KAT against pinned primary sources.

This is a qualification check, not a cryptographic-security certificate. It
needs the retained upstream Python generator; it performs no network access.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys


GENERATOR_SHA256 = "89c51d810f9f79b76ae74128728f9ab8a70f35d13f9c9b947951623928716096"
UPSTREAM_COMMIT = "0df3bdcf5a951a25d03dfba0d7caaf0ebef5622b"


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iroha", type=Path, default=root.parent / "iroha")
    parser.add_argument(
        "--generator", type=Path,
        default=root / "output/qualification/native-proof/primary-crypto-sources/Plonky3-generate_constants.py",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    generator_bytes = args.generator.read_bytes()
    if hashlib.sha256(generator_bytes).hexdigest() != GENERATOR_SHA256:
        raise ValueError("Upstream generator does not match the pinned source hash")
    source_path = args.iroha / "crates/iroha_core/src/execution_proofs/poseidon2_constants.rs"
    source = source_path.read_text()

    def native_words(name):
        match = re.search(r"const " + name + r"\s*:.*?=\s*\[(.*?)\];", source, re.S)
        if not match:
            raise ValueError("Missing native constant " + name)
        return [int(value.replace("_", ""), 16) for value in re.findall(r"0x[0-9a-fA-F_]+", match[1])]

    generated = json.loads(subprocess.check_output([
        sys.executable, str(args.generator), "--field", "goldilocks", "--width", "16",
        "--format", "json", "--skip-matrix",
    ], text=True))
    expected_parameters = dict(field="goldilocks", prime="18446744069414584321", width=16, alpha=7, R_F=8, R_P=22)
    if any(generated[key] != value for key, value in expected_parameters.items()):
        raise ValueError("Generated parameters differ from the compiled execution suite")
    initial = [[int(value, 16) for value in row] for row in generated["external_initial"]]
    internal = [int(value, 16) for value in generated["internal"]]
    final = [[int(value, 16) for value in row] for row in generated["external_final"]]
    for name, expected in [
        ("EXTERNAL_INITIAL", sum(initial, [])), ("INTERNAL", internal),
        ("EXTERNAL_FINAL", sum(final, [])),
    ]:
        if native_words(name) != expected:
            raise ValueError("Grain regeneration mismatch for " + name)

    spec = importlib.util.spec_from_file_location("pinned_poseidon2_generator", args.generator)
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    kat = upstream.DEFAULT_POSEIDON2_TEST_VECTORS[("goldilocks", 16)]
    if native_words("UPSTREAM_INPUT") != kat["input"] or native_words("UPSTREAM_OUTPUT") != kat["expected"]:
        raise ValueError("Native KAT differs from the upstream embedded production vector")

    # The generator's optional Grain diagonal and its default external M4 are
    # not Plonky3's selected production matrices. Use the actual published
    # MDSMat4 circulant and native production diagonal with the upstream dense
    # Python matrix evaluator. This checks the complete permutation separately
    # from native Rust arithmetic and its optimized inter-block schedule.
    m4 = [[(2, 3, 1, 1)[(column - row) % 4] for column in range(4)] for row in range(4)]
    external = [[
        (2 if row // 4 == column // 4 else 1) * m4[row % 4][column % 4]
        for column in range(16)
    ] for row in range(16)]
    actual = upstream.poseidon2_permutation(
        kat["input"], external, native_words("INTERNAL_DIAGONAL"),
        initial, internal, final, 7, int(generated["prime"]), 16,
    )
    if actual != kat["expected"]:
        raise ValueError("Independent dense Python permutation differs from the production KAT")
    report = {
        "status": "passed", "qualified": False,
        "upstream_commit": UPSTREAM_COMMIT,
        "generator_sha256": GENERATOR_SHA256,
        "native_constants_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "regenerated_round_constants": 150,
        "permutation_words_checked": 16,
        "matrix_mode": "published Plonky3 MDSMat4 and structured internal diagonal; not the generator's optional Grain diagonal",
        "parameters": expected_parameters,
    }
    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
