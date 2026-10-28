import { sha256 } from '@noble/hashes/sha256';

/** Teaching arithmetic only. These values are never accepted as native proofs. */
export const TOY_PRIME = 17;
export const field = (n: number): number => ((n % TOY_PRIME) + TOY_PRIME) % TOY_PRIME;
export function inverse(n: number): number {
  if (field(n) === 0) throw new Error('Zero has no field inverse');
  let result = 1;
  for (let i = 0; i < 15; i++) result = field(result * n);
  return result;
}
export interface ToyRow { tick: number; input: number; speed: number; position: number; }
export function toyTrace(tampered = false): ToyRow[] {
  const inputs = [1, 1, 0, 1, 0, 1, 0, 0];
  const rows: ToyRow[] = [{ tick: 0, input: inputs[0]!, speed: 1, position: 0 }];
  for (let tick = 1; tick < inputs.length; tick++) {
    const previous = rows[tick - 1]!, speed = field(previous.speed + previous.input);
    rows.push({ tick, input: inputs[tick]!, speed, position: field(previous.position + speed) });
  }
  if (tampered) rows[4]!.position = field(rows[4]!.position + 3);
  return rows;
}
export function traceResiduals(rows: readonly ToyRow[]): number[][] {
  return rows.slice(0, -1).map((row, i) => {
    const next = rows[i + 1]!;
    return [field(next.speed - row.speed - row.input), field(next.position - row.position - next.speed), field(row.input * (row.input - 1))];
  });
}
export function interpolateTrace(rows: readonly ToyRow[], x: number): number {
  return field(rows.reduce((sum, row, i) => {
    let basis = 1;
    rows.forEach((other, j) => { if (i !== j) basis = field(basis * field(x - other.tick) * inverse(row.tick - other.tick)); });
    return sum + field(row.position * basis);
  }, 0));
}
const hex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
export function traceCommitment(rows: readonly ToyRow[]): { levels: Uint8Array[][]; root: string } {
  const levels = [rows.map(row => sha256(Uint8Array.of(0, row.tick, row.input, row.speed, row.position)))];
  while (levels.at(-1)!.length > 1) {
    const last = levels.at(-1)!;
    levels.push(Array.from({ length: last.length / 2 }, (_, i) => sha256(Uint8Array.from([1, ...last[i * 2]!, ...last[i * 2 + 1]!]))));
  }
  return { levels, root: hex(levels.at(-1)![0]!) };
}
export function toyChallenge(root: string, nonce: number): { row: number; digest: string } {
  const bytes = sha256(new TextEncoder().encode(`sora-cars:teaching-only:challenge|demo-network|demo-session|${root}|${nonce}`));
  return { row: bytes[0]! & 7, digest: hex(bytes) };
}
export interface FoldLayer { domain: number[]; values: number[]; }
export function foldLayer(layer: FoldLayer, beta: number): FoldLayer {
  const half = layer.domain.length / 2;
  return {
    domain: layer.domain.slice(0, half).map(x => field(x * x)),
    values: layer.values.slice(0, half).map((positive, i) => {
      const negative = layer.values[i + half]!, x = layer.domain[i]!;
      return field(field(positive + negative) * inverse(2) + beta * field(positive - negative) * inverse(2 * x));
    }),
  };
}
export function foldingExample(beta = 5): FoldLayer[] {
  let x = 1;
  const domain = Array.from({ length: 16 }, () => { const result = x; x = field(x * 3); return result; });
  const first = { domain, values: domain.map(x => field(3 + 2 * x + 4 * x * x + x * x * x)) };
  const second = foldLayer(first, beta);
  return [first, second, foldLayer(second, 7)];
}
