"""Recalculate the conditional Stock bounds from the signed circuit geometry. Python 3.11+."""
import csv
from collections import Counter
from decimal import Decimal, getcontext
from fractions import Fraction
from math import comb, isqrt
from pathlib import Path


getcontext().prec = 70
FIELD_SIZE = (2**64 - 2**32 + 1)**4
RATE = Decimal(1) / 8
M = 128
QUERIES = 87
CURVE_FACTOR = (Decimal(M) + Decimal("0.5"))**7 / (3 * RATE**Decimal("1.5"))


def bits(probability):
    return -probability.ln() / Decimal(2).ln()


def round_bounds(shape):
    n = 2**int(shape["log_rows"])
    domain = 8 * n
    numerator = (2*M + 1)**2 * domain * (n + 2)
    denominator = (2*M)**2
    threshold = isqrt(numerator // denominator)
    if threshold**2 * denominator < numerator:
        threshold += 1
    list_bound = domain * (threshold - n) // (threshold**2 - domain*n)
    occurrences = n * (int(shape["range_lookups"]) + int(shape["fixed_lookups"])) + int(shape["table"])
    residual_degree = int(shape["degree"]) * (n + 1) + (n - 1)
    errors = {
        "lookup": Decimal(2 * list_bound * occurrences) / FIELD_SIZE,
        "composition": Decimal(list_bound * (int(shape["identities"]) - 1)) / FIELD_SIZE,
        "two_residuals": Decimal(2 * list_bound * residual_degree) / (FIELD_SIZE - n - domain),
        "deep": (int(shape["batch"]) - 1) * CURVE_FACTOR * domain**2 / FIELD_SIZE,
        "queries": Decimal(comb(threshold - 1, QUERIES)) / comb(domain, QUERIES),
    }
    width, dimension, weight_denominator = domain, n, 1
    fold = 0
    while dimension > 16:
        assert dimension % 8 == 0
        width //= 8
        dimension //= 8
        weight_denominator *= 8
        fold += 1
        assert Decimal(dimension) / width == RATE and weight_denominator * width == domain
        curve_error = 7 * CURVE_FACTOR * width**2 / FIELD_SIZE
        weight_error = Decimal(7 * (2*M + 1) * (weight_denominator*width + 1)) / (RATE.sqrt() * FIELD_SIZE)
        errors[f"fold_{fold}"] = max(curve_error, weight_error)
    return threshold, list_bound, errors


def compiler_budget():
    domain = 65_536
    depths = (16, 16, 16, 13, 10, 7)
    merkle = sum(min(QUERIES, 2**level) for depth in depths for level in range(depth + 1))
    verifier_calls = merkle + 35 + 8*3 + 24
    assert merkle == 4_416 and verifier_calls == 4_499
    field_tail = comb(18, 15) * Fraction(2**32 - 1, 2**64)**15
    index_tail = comb(144, 58) * Fraction(86, domain)**58
    query_error = Fraction(comb(23_263, QUERIES), comb(domain, QUERIES))
    rounded_bits = (224, 237, 231, 161, 175, 181, 187)
    round_error = query_error + sum(Fraction(1, 2**k) for k in rounded_bits)
    # The normalized upper bound is convex. Its maximum on this interval is at an endpoint.
    for adversary_calls in (1, 2**128):
        reserved = 32 * (adversary_calls + verifier_calls)
        collision = Fraction(4 * (reserved + 1)**2, 2**384)
        probability = (adversary_calls + 1) * (round_error + 8*field_tail + index_tail) + collision
        normalized = probability / adversary_calls
        assert normalized < Fraction(1, 2**129)
        print(f"T={adversary_calls} conditional bits per adversary call = "
              f"{bits(Decimal(normalized.numerator) / normalized.denominator):.9f}")


def main():
    counts = Counter()
    minima = {}
    seen = set()
    with Path(__file__).with_name("shapes.tsv").open() as source:
        for shape in csv.DictReader(source, delimiter="\t"):
            scope = shape["scope"]
            key = (scope, shape["track"], int(shape["cars"]), int(shape["log_rows"]))
            assert key not in seen
            seen.add(key)
            counts[scope] += 1
            threshold, list_bound, errors = round_bounds(shape)
            for name, error in errors.items():
                bound = bits(error)
                assert bound > 129
                if scope == "native":
                    minima[name] = min(minima.get(name, bound), bound)
            if scope == "native":
                assert threshold == 23_264 and list_bound == 227 and "fold_3" in errors
    assert counts == {"engine": 144, "native": 24}
    assert all(minima[name] > floor for name, floor in (
        ("lookup", 224), ("composition", 237), ("two_residuals", 231), ("deep", 161),
        ("fold_1", 175), ("fold_2", 181), ("fold_3", 187)))
    print(f"{counts['native']} native and {counts['engine']} engine configurations")
    for name, bound in minima.items():
        print(f"native {name} = {bound:.9f} bits")
    compiler_budget()


if __name__ == "__main__":
    main()
