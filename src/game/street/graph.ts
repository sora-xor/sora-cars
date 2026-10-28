import { streetHeadingAt, streetIntervalAt, streetSampleAt, type CompiledStreetTrack, type StreetSample } from './track';

/** Local native-authored draft arithmetic. This is not verifier admission. */
export const STREET_GRAPH_DOMAIN = 'sora-cars.street-arithmetic.v1';
const LIMIT = 2 ** 50;
const MAX_NODES = 131_072;
const MAX_PORTS = 1_024;
type Bounds = { readonly low: number; readonly high: number };
export type StreetGraphGeometryField = 'heading' | 'half_width' | 'interval_turn' | 'interval_span';
export type StreetGraphNode = Bounds & (
  | { readonly op: 'input'; readonly input: number }
  | { readonly op: 'constant'; readonly value: number }
  | { readonly op: 'add' | 'subtract' | 'multiply' | 'divide' | 'less' | 'equal'; readonly a: number; readonly b: number }
  | { readonly op: 'remainder'; readonly a: number; readonly divisor: number }
  | { readonly op: 'select'; readonly condition: number; readonly yes: number; readonly no: number }
  | { readonly op: 'geometry'; readonly field: StreetGraphGeometryField; readonly progress: number }
);
export interface StreetGraphPort { readonly name: string; readonly node: number }
export interface StreetGraph {
  readonly version: 1;
  readonly domain: typeof STREET_GRAPH_DOMAIN;
  readonly geometryLookup: 'unqualified';
  readonly inputs: readonly StreetGraphPort[];
  readonly nodes: readonly StreetGraphNode[];
  readonly outputs: readonly StreetGraphPort[];
}
export type StreetGraphExecutor = (inputs: readonly number[]) => Readonly<Record<string, number>>;

const geometryBounds: Readonly<Record<StreetGraphGeometryField, readonly [number, number]>> = {
  heading: [-210_000_000, 210_000_000], half_width: [2_500, 12_000],
  interval_turn: [-499_999, 499_999], interval_span: [4_900, 5_000],
};
const fail = (message: string): never => { throw new RangeError(`Street graph: ${message}`); };

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return fail(`${label} must be a JSON object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))
    || Object.values(descriptors).some(d => !d.enumerable || !Object.hasOwn(d, 'value'))) return fail(`${label} has invalid fields`);
  return value as Record<string, unknown>;
}

function array(value: unknown, maximum: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(`${label} must be a bounded JSON array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== value.length + 1
    || Array.from({ length: value.length }, (_, i) => descriptors[String(i)])
      .some(d => !d || !d.enumerable || !Object.hasOwn(d, 'value'))) return fail(`${label} must be a dense JSON array`);
  return value;
}

function integer(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < low || value > high) return fail(`${label} is outside integer bounds`);
  return value === 0 ? 0 : value;
}

function bounds(value: Record<string, unknown>, label: string): Bounds {
  const low = integer(value.low, -LIMIT + 1, LIMIT - 1, `${label}.low`);
  const high = integer(value.high, low, LIMIT - 1, `${label}.high`);
  return { low, high };
}

function name(value: unknown): string {
  // Rust String contains Unicode scalar values, never lone UTF-16 surrogates.
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return fail('invalid port name');
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < 1 || bytes > 96) return fail('port name must be 1–96 UTF-8 bytes');
  return value;
}

/** Capture only the geometry consumed by the graph. The checks mirror
 * StreetGeometry::new; historical alignment and proof membership remain open.
 */
function snapshotTrack(track: CompiledStreetTrack): CompiledStreetTrack {
  if (!track || typeof track !== 'object') return fail('missing street geometry');
  const topology = track.topology;
  if (topology !== 'circuit' && topology !== 'sprint') return fail('invalid geometry topology');
  const lengthMm = integer(track.lengthMm, 500_000, 20_000_000, 'geometry length');
  const rawSamples = array(track.samples, 4_001, 'geometry samples');
  if (rawSamples.length !== Math.ceil(lengthMm / 5_000) + 1) return fail('invalid geometry sample count');
  const fields = ['progressMm', 'eastMm', 'northMm', 'elevationMm', 'halfWidthMm', 'headingMicroturn', 'turnPerMetre', 'sector'] as const;
  const samples = rawSamples.map((raw, i): StreetSample => {
    const row = record(raw, fields, `geometry sample ${i}`);
    const expected = i === rawSamples.length - 1 ? lengthMm
      : Math.floor((i * lengthMm + Math.floor((rawSamples.length - 1) / 2)) / (rawSamples.length - 1));
    return Object.freeze({
      progressMm: integer(row.progressMm, expected, expected, 'geometry station'),
      eastMm: integer(row.eastMm, -15_000_000, 15_000_000, 'geometry east'),
      northMm: integer(row.northMm, -15_000_000, 15_000_000, 'geometry north'),
      elevationMm: integer(row.elevationMm, -100_000, 4_000_000, 'geometry elevation'),
      halfWidthMm: integer(row.halfWidthMm, 2_500, 12_000, 'geometry width'),
      headingMicroturn: integer(row.headingMicroturn, -2_000_000, 2_000_000, 'geometry heading'),
      turnPerMetre: integer(row.turnPerMetre, -40_000, 40_000, 'geometry curvature'),
      sector: integer(row.sector, 0, 31, 'geometry sector'),
    });
  });
  const first = samples[0]!, last = samples.at(-1)!;
  if (topology === 'circuit') {
    if (Math.abs(last.headingMicroturn - first.headingMicroturn) !== 1_000_000
      || (['eastMm', 'northMm', 'elevationMm', 'halfWidthMm', 'turnPerMetre', 'sector'] as const)
        .some(field => first[field] !== last[field])) return fail('invalid circuit endpoint');
  } else {
    const east = last.eastMm - first.eastMm, north = last.northMm - first.northMm;
    if (east * east + north * north < 25_000_000 || first.turnPerMetre !== 0 || last.turnPerMetre !== 0
      || last.headingMicroturn !== samples.at(-2)!.headingMicroturn) return fail('invalid sprint endpoint');
  }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    if (Math.abs(b.headingMicroturn - a.headingMicroturn) >= 500_000
      || a.eastMm === b.eastMm && a.northMm === b.northMm) return fail('invalid geometry interval');
    if (Math.abs(b.headingMicroturn - a.headingMicroturn) * Math.max(a.halfWidthMm, b.halfWidthMm) * 1_000
      > 79_000_000 * (b.progressMm - a.progressMm)) return fail('geometry turn exceeds the shared interval bound');
  }
  // Metadata is intentionally absent: no graph operation consumes an identity,
  // soundtrack or qualification claim. Frozen numbers are the entire input.
  return Object.freeze({ topology, lengthMm, samples: Object.freeze(samples) }) as CompiledStreetTrack;
}

function snapshotGraph(graph: StreetGraph): StreetGraph {
  const source = record(graph, ['version', 'domain', 'geometryLookup', 'inputs', 'nodes', 'outputs'], 'graph');
  if (source.version !== 1 || source.domain !== STREET_GRAPH_DOMAIN || source.geometryLookup !== 'unqualified') return fail('unsupported graph domain or qualification');
  const rawNodes = array(source.nodes, MAX_NODES, 'nodes');
  const rawInputs = array(source.inputs, MAX_PORTS, 'inputs');
  const rawOutputs = array(source.outputs, MAX_PORTS, 'outputs');
  const nodes: StreetGraphNode[] = [];
  const ref = (value: unknown, index: number) => integer(value, 0, index - 1, 'backward node reference');
  for (let index = 0; index < rawNodes.length; index++) {
    const raw = rawNodes[index];
    if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'op')) return fail('node must declare an op');
    const descriptor = Object.getOwnPropertyDescriptor(raw, 'op');
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fail('node op must be data');
    const op: unknown = descriptor.value;
    const common = ['op', 'low', 'high'];
    let node: StreetGraphNode;
    switch (op) {
      case 'input': {
        const value = record(raw, [...common, 'input'], `node ${index}`);
        node = { op, ...bounds(value, `node ${index}`), input: integer(value.input, 0, rawInputs.length - 1, 'input index') };
        break;
      }
      case 'constant': {
        const value = record(raw, [...common, 'value'], `node ${index}`), range = bounds(value, `node ${index}`);
        if (range.low !== range.high || range.low !== value.value) return fail('constant requires canonical singleton bounds');
        node = { op, ...range, value: integer(value.value, range.low, range.high, 'constant') };
        break;
      }
      case 'add': case 'subtract': case 'multiply': case 'divide': case 'less': case 'equal': {
        const value = record(raw, [...common, 'a', 'b'], `node ${index}`), a = ref(value.a, index), b = ref(value.b, index);
        if (op === 'divide' && nodes[b]!.low <= 0) return fail('division requires a strictly positive denominator range');
        node = { op, ...bounds(value, `node ${index}`), a, b };
        break;
      }
      case 'remainder': {
        const value = record(raw, [...common, 'a', 'divisor'], `node ${index}`), a = ref(value.a, index);
        if (nodes[a]!.low < 0) return fail('remainder requires a nonnegative operand range');
        node = { op, ...bounds(value, `node ${index}`), a, divisor: integer(value.divisor, 1, LIMIT - 1, 'remainder divisor') };
        break;
      }
      case 'select': {
        const value = record(raw, [...common, 'condition', 'yes', 'no'], `node ${index}`);
        const condition = ref(value.condition, index), yes = ref(value.yes, index), no = ref(value.no, index);
        if (nodes[condition]!.low < 0 || nodes[condition]!.high > 1) return fail('select requires a Boolean condition range');
        node = { op, ...bounds(value, `node ${index}`), condition, yes, no };
        break;
      }
      case 'geometry': {
        const value = record(raw, [...common, 'field', 'progress'], `node ${index}`), progress = ref(value.progress, index);
        if (typeof value.field !== 'string' || !Object.hasOwn(geometryBounds, value.field)) return fail('unknown geometry field');
        if (nodes[progress]!.low < -100_000_000 || nodes[progress]!.high > 100_000_000) return fail('geometry progress range exceeds shared bounds');
        const field = value.field as StreetGraphGeometryField;
        const range = bounds(value, `node ${index}`), [low, high] = geometryBounds[field];
        if (range.low !== low || range.high !== high) return fail('geometry requires canonical field bounds');
        node = { op, ...range, field, progress };
        break;
      }
      default: return fail('unknown node operation');
    }
    nodes.push(Object.freeze(node));
  }
  const ports = (raw: readonly unknown[], label: string): readonly StreetGraphPort[] => {
    const names = new Set<string>();
    return Object.freeze(raw.map((port, index) => {
      const value = record(port, ['name', 'node'], `${label} ${index}`), portName = name(value.name);
      if (names.has(portName)) return fail(`duplicate ${label} name`);
      names.add(portName);
      return Object.freeze({ name: portName, node: integer(value.node, 0, nodes.length - 1, `${label} reference`) });
    }));
  };
  const inputs = ports(rawInputs, 'input'), outputs = ports(rawOutputs, 'output');
  for (let i = 0; i < inputs.length; i++) {
    const node = nodes[inputs[i]!.node]!;
    if (node.op !== 'input' || node.input !== i) return fail('input ports must match declared input nodes');
  }
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.op === 'input' && inputs[node.input]?.node !== i) return fail('every input node must be listed exactly once');
  }
  return Object.freeze({ version: 1, domain: STREET_GRAPH_DOMAIN, geometryLookup: 'unqualified', inputs, nodes: Object.freeze(nodes), outputs });
}

/** Validate and capture a graph/geometry pair once, then evaluate every node in
 * declared order. A rejected call produces no partial result or retained state.
 * Branches are dataflow operands: even unselected and unused nodes must pass.
 */
export function createStreetGraphExecutor(graph: StreetGraph, track: CompiledStreetTrack): StreetGraphExecutor {
  const captured = snapshotGraph(graph), geometry = snapshotTrack(track);
  return (inputs: readonly number[]) => {
    const rawInputs = array(inputs, MAX_PORTS, 'execution inputs');
    if (rawInputs.length !== captured.inputs.length) return fail('execution input count mismatch');
    const checkedInputs = rawInputs.map((value, i) => {
      const node = captured.nodes[captured.inputs[i]!.node]!;
      return integer(value, node.low, node.high, `input ${i}`);
    });
    const values: number[] = [];
    for (let i = 0; i < captured.nodes.length; i++) {
      const node = captured.nodes[i]!;
      let value: number;
      switch (node.op) {
        case 'input': value = checkedInputs[node.input]!; break;
        case 'constant': value = node.value; break;
        case 'add': value = values[node.a]! + values[node.b]!; break;
        case 'subtract': value = values[node.a]! - values[node.b]!; break;
        case 'multiply': value = values[node.a]! * values[node.b]!; break;
        case 'divide': {
          const denominator = values[node.b]!;
          if (denominator <= 0) return fail('division denominator must be positive');
          value = Math.trunc(values[node.a]! / denominator); break;
        }
        case 'less': value = Number(values[node.a]! < values[node.b]!); break;
        case 'equal': value = Number(values[node.a]! === values[node.b]!); break;
        case 'remainder': {
          const operand = values[node.a]!;
          if (operand < 0) return fail('remainder operand must be nonnegative');
          value = operand % node.divisor; break;
        }
        case 'select': {
          const condition = values[node.condition]!;
          if (condition !== 0 && condition !== 1) return fail('select condition must be Boolean');
          value = values[condition === 1 ? node.yes : node.no]!; break;
        }
        case 'geometry': {
          const progress = values[node.progress]!;
          if (node.field === 'heading') value = streetHeadingAt(geometry, progress);
          else if (node.field === 'half_width') value = streetSampleAt(geometry, progress).halfWidthMm;
          else {
            const [a, b] = streetIntervalAt(geometry, progress);
            value = node.field === 'interval_turn' ? b.headingMicroturn - a.headingMicroturn : b.progressMm - a.progressMm;
          }
          const [low, high] = geometryBounds[node.field];
          integer(value, low, high, `geometry ${node.field}`);
          break;
        }
      }
      values.push(integer(value, node.low, node.high, `node ${i}`));
    }
    // fromEntries preserves even __proto__ as an own data property.
    return Object.freeze(Object.fromEntries(captured.outputs.map(output => [output.name, values[output.node]!]))) as Readonly<Record<string, number>>;
  };
}
