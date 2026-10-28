//! Bounded scalar arithmetic graph for proposed street rules.
//!
//! This is an executable rule description, not an AIR, proof verifier or native
//! Iroha extension. Geometry operations are explicitly unqualified lookup
//! primitives; their table membership and integer arithmetic need future AIR
//! lowering. All nodes, including unused nodes and unselected branches, execute.

use std::{collections::BTreeMap, fmt::Write};

const LIMIT: i128 = 1_i128 << 50;
const MAX_NODES: usize = 131_072;
const MAX_INPUTS: usize = 1_024;
const MAX_OUTPUTS: usize = 1_024;
const MAX_PROGRESS: i64 = 100_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Value {
    pub index: usize,
    pub low: i64,
    pub high: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeometryField {
    Heading,
    HalfWidth,
    IntervalTurn,
    IntervalSpan,
}

impl GeometryField {
    fn name(self) -> &'static str {
        match self {
            Self::Heading => "heading",
            Self::HalfWidth => "half_width",
            Self::IntervalTurn => "interval_turn",
            Self::IntervalSpan => "interval_span",
        }
    }

    fn bounds(self) -> (i64, i64) {
        match self {
            Self::Heading => (-210_000_000, 210_000_000),
            Self::HalfWidth => (2_500, 12_000),
            Self::IntervalTurn => (-499_999, 499_999),
            Self::IntervalSpan => (4_900, 5_000),
        }
    }
}

/// Read-only operation vocabulary for native constraint lowering. Exposing this
/// enum cannot install or mutate a graph; relations still construct Graph values
/// through the bounded native builders.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operation {
    Input(usize),
    Constant(i64),
    Add(usize, usize),
    Subtract(usize, usize),
    Multiply(usize, usize),
    Divide(usize, usize),
    Remainder(usize, i64),
    Less(usize, usize),
    Equal(usize, usize),
    Select(usize, usize, usize),
    Geometry(GeometryField, usize),
}

type Op = Operation;

/// One node in construction order. Consumers must retain every node and its
/// exact interval, including narrowed assertions not reachable from outputs.
#[derive(Clone, Copy, Debug)]
pub struct NodeView {
    pub value: Value,
    pub operation: Operation,
}

#[derive(Clone, Copy, Debug)]
struct Node {
    op: Op,
    low: i64,
    high: i64,
}

#[derive(Clone, Debug)]
struct Input {
    name: String,
    node: usize,
}

#[derive(Default, Debug)]
pub struct Graph {
    nodes: Vec<Node>,
    inputs: Vec<Input>,
    constants: BTreeMap<i64, Value>,
}

fn checked_bounds(low: i128, high: i128) -> (i64, i64) {
    assert!(low <= high, "arithmetic graph has inverted bounds");
    assert!(
        low > -LIMIT && high < LIMIT,
        "arithmetic graph bounds exceed 2^50"
    );
    (
        i64::try_from(low).expect("bounded lower endpoint fits i64"),
        i64::try_from(high).expect("bounded upper endpoint fits i64"),
    )
}

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 96 && !name.chars().any(|c| c.is_ascii_control())
}

fn quote(value: &str) -> String {
    let mut encoded = String::from("\"");
    for character in value.chars() {
        match character {
            '"' => encoded.push_str("\\\""),
            '\\' => encoded.push_str("\\\\"),
            '\n' => encoded.push_str("\\n"),
            '\r' => encoded.push_str("\\r"),
            '\t' => encoded.push_str("\\t"),
            c if c <= '\u{1f}' => write!(encoded, "\\u{:04x}", u32::from(c)).unwrap(),
            c => encoded.push(c),
        }
    }
    encoded.push('"');
    encoded
}

impl Graph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Inspect every node, without output slicing, in dependency order.
    pub fn inspect(&self) -> impl ExactSizeIterator<Item = NodeView> + '_ {
        self.nodes.iter().enumerate().map(|(index, node)| NodeView {
            value: Value { index, low: node.low, high: node.high },
            operation: node.op,
        })
    }

    /// Canonical external input order, detached from mutable caller metadata.
    pub fn inspect_inputs(&self) -> impl ExactSizeIterator<Item = (&str, Value)> + '_ {
        self.inputs.iter().map(|input| {
            let node = self.nodes[input.node];
            (input.name.as_str(), Value { index: input.node, low: node.low, high: node.high })
        })
    }

    fn value(&self, value: Value) -> Value {
        let node = self
            .nodes
            .get(value.index)
            .expect("value is not a prior graph node");
        assert_eq!(
            (value.low, value.high),
            (node.low, node.high),
            "value bounds were altered"
        );
        value
    }

    fn push(&mut self, op: Op, low: i128, high: i128) -> Value {
        assert!(
            self.nodes.len() < MAX_NODES,
            "arithmetic graph node limit exceeded"
        );
        let (low, high) = checked_bounds(low, high);
        let value = Value {
            index: self.nodes.len(),
            low,
            high,
        };
        self.nodes.push(Node { op, low, high });
        value
    }

    pub fn input(&mut self, name: &str, low: i64, high: i64) -> Value {
        assert!(valid_name(name), "invalid arithmetic graph input name");
        assert!(
            self.inputs.len() < MAX_INPUTS,
            "arithmetic graph input limit exceeded"
        );
        assert!(
            !self.inputs.iter().any(|input| input.name == name),
            "duplicate graph input name"
        );
        let value = self.push(
            Op::Input(self.inputs.len()),
            i128::from(low),
            i128::from(high),
        );
        self.inputs.push(Input {
            name: name.to_owned(),
            node: value.index,
        });
        value
    }

    pub fn constant(&mut self, value: i64) -> Value {
        if let Some(existing) = self.constants.get(&value) {
            return *existing;
        }
        let node = self.push(Op::Constant(value), i128::from(value), i128::from(value));
        self.constants.insert(value, node);
        node
    }

    /// Eager assertion encoded as a narrowed select. A future AIR must enforce
    /// this singleton range; it is not an unconstrained host-side assertion.
    pub fn require_true(&mut self, condition: Value) -> Value {
        let condition = self.value(condition);
        assert!(
            condition.low >= 0 && condition.high <= 1,
            "assertion must be Boolean"
        );
        let yes = self.constant(1);
        let no = self.constant(0);
        self.push(Op::Select(condition.index, yes.index, no.index), 1, 1)
    }

    pub fn add(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        self.push(
            Op::Add(a.index, b.index),
            i128::from(a.low) + i128::from(b.low),
            i128::from(a.high) + i128::from(b.high),
        )
    }

    pub fn sub(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        self.push(
            Op::Subtract(a.index, b.index),
            i128::from(a.low) - i128::from(b.high),
            i128::from(a.high) - i128::from(b.low),
        )
    }

    pub fn mul(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        let products = [
            i128::from(a.low) * i128::from(b.low),
            i128::from(a.low) * i128::from(b.high),
            i128::from(a.high) * i128::from(b.low),
            i128::from(a.high) * i128::from(b.high),
        ];
        self.push(
            Op::Multiply(a.index, b.index),
            *products.iter().min().unwrap(),
            *products.iter().max().unwrap(),
        )
    }

    /// Positive variable denominator; signed division truncates toward zero.
    pub fn divide(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        assert!(b.low > 0, "division denominator bounds must be positive");
        let quotients = [
            i128::from(a.low) / i128::from(b.low),
            i128::from(a.low) / i128::from(b.high),
            i128::from(a.high) / i128::from(b.low),
            i128::from(a.high) / i128::from(b.high),
        ];
        self.push(
            Op::Divide(a.index, b.index),
            *quotients.iter().min().unwrap(),
            *quotients.iter().max().unwrap(),
        )
    }

    /// Nonnegative remainder only; signed Euclidean wrapping is a geometry rule.
    pub fn remainder(&mut self, a: Value, divisor: i64) -> Value {
        let a = self.value(a);
        assert!(a.low >= 0, "remainder operand bounds must be nonnegative");
        assert!(
            divisor > 0 && i128::from(divisor) < LIMIT,
            "invalid remainder divisor"
        );
        self.push(Op::Remainder(a.index, divisor), 0, i128::from(divisor - 1))
    }

    pub fn less(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        self.push(Op::Less(a.index, b.index), 0, 1)
    }

    pub fn equal(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        self.push(Op::Equal(a.index, b.index), 0, 1)
    }

    pub fn select(&mut self, condition: Value, yes: Value, no: Value) -> Value {
        let (condition, yes, no) = (self.value(condition), self.value(yes), self.value(no));
        assert!(
            condition.low >= 0 && condition.high <= 1,
            "select condition bounds must be Boolean"
        );
        self.push(
            Op::Select(condition.index, yes.index, no.index),
            i128::from(yes.low.min(no.low)),
            i128::from(yes.high.max(no.high)),
        )
    }

    /// The guard permits a tighter range assertion than a generic select union.
    pub fn minimum(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        let condition = self.less(a, b);
        self.push(
            Op::Select(condition.index, a.index, b.index),
            i128::from(a.low.min(b.low)),
            i128::from(a.high.min(b.high)),
        )
    }

    pub fn maximum(&mut self, a: Value, b: Value) -> Value {
        let (a, b) = (self.value(a), self.value(b));
        let condition = self.less(a, b);
        self.push(
            Op::Select(condition.index, b.index, a.index),
            i128::from(a.low.max(b.low)),
            i128::from(a.high.max(b.high)),
        )
    }

    pub fn clamp(&mut self, value: Value, low: i64, high: i64) -> Value {
        checked_bounds(i128::from(low), i128::from(high));
        let low = self.constant(low);
        let high = self.constant(high);
        let lower = self.maximum(value, low);
        self.minimum(lower, high)
    }

    pub fn negate(&mut self, value: Value) -> Value {
        let zero = self.constant(0);
        self.sub(zero, value)
    }

    pub fn absolute(&mut self, value: Value) -> Value {
        let value = self.value(value);
        if value.low >= 0 {
            return value;
        }
        if value.high <= 0 {
            return self.negate(value);
        }
        let negative = self.negate(value);
        let zero = self.constant(0);
        let condition = self.less(value, zero);
        self.push(
            Op::Select(condition.index, negative.index, value.index),
            0,
            i128::from((-value.low).max(value.high)),
        )
    }

    pub fn geometry(&mut self, field: GeometryField, progress: Value) -> Value {
        let progress = self.value(progress);
        assert!(
            progress.low >= -MAX_PROGRESS && progress.high <= MAX_PROGRESS,
            "geometry progress bounds exceed shared limit"
        );
        let (low, high) = field.bounds();
        self.push(
            Op::Geometry(field, progress.index),
            i128::from(low),
            i128::from(high),
        )
    }

    pub fn evaluate(
        &self,
        inputs: &[i64],
        geo: &crate::geometry::StreetGeometry<'_>,
    ) -> Result<Vec<i64>, &'static str> {
        if inputs.len() != self.inputs.len() {
            return Err("arithmetic graph input count mismatch");
        }
        let mut values: Vec<i64> = Vec::with_capacity(self.nodes.len());
        for node in &self.nodes {
            let get = |index: usize| {
                values
                    .get(index)
                    .copied()
                    .ok_or("arithmetic graph forward or missing reference")
            };
            let computed = match node.op {
                Op::Input(index) => {
                    i128::from(*inputs.get(index).ok_or("missing arithmetic graph input")?)
                }
                Op::Constant(value) => i128::from(value),
                Op::Add(a, b) => i128::from(get(a)?) + i128::from(get(b)?),
                Op::Subtract(a, b) => i128::from(get(a)?) - i128::from(get(b)?),
                Op::Multiply(a, b) => i128::from(get(a)?) * i128::from(get(b)?),
                Op::Divide(a, b) => {
                    let divisor = get(b)?;
                    if divisor <= 0 {
                        return Err("arithmetic graph division requires positive denominator");
                    }
                    i128::from(get(a)?) / i128::from(divisor)
                }
                Op::Remainder(a, divisor) => {
                    let value = get(a)?;
                    if value < 0 || divisor <= 0 {
                        return Err("invalid arithmetic graph remainder operands");
                    }
                    i128::from(value % divisor)
                }
                Op::Less(a, b) => i128::from(u8::from(get(a)? < get(b)?)),
                Op::Equal(a, b) => i128::from(u8::from(get(a)? == get(b)?)),
                Op::Select(condition, yes, no) => match get(condition)? {
                    0 => i128::from(get(no)?),
                    1 => i128::from(get(yes)?),
                    _ => return Err("non-Boolean arithmetic graph select"),
                },
                Op::Geometry(field, progress) => {
                    let progress = get(progress)?;
                    i128::from(match field {
                        GeometryField::Heading => geo.heading_at(progress)?,
                        GeometryField::HalfWidth => geo.sample_at(progress)?[4],
                        GeometryField::IntervalTurn => {
                            let (a, b) = geo.interval_at(progress)?;
                            b[5] - a[5]
                        }
                        GeometryField::IntervalSpan => {
                            let (a, b) = geo.interval_at(progress)?;
                            b[0] - a[0]
                        }
                    })
                }
            };
            if computed <= -LIMIT
                || computed >= LIMIT
                || computed < i128::from(node.low)
                || computed > i128::from(node.high)
            {
                return Err("arithmetic graph node exceeds declared bounds");
            }
            values.push(i64::try_from(computed).map_err(|_| "arithmetic graph integer overflow")?);
        }
        Ok(values)
    }

    /// One closed schema shared with the browser interpreter. No serialized
    /// geometry operation is a claim of authenticated table membership.
    pub fn to_json(&self, outputs: &[(&str, Value)]) -> String {
        assert!(
            outputs.len() <= MAX_OUTPUTS,
            "arithmetic graph output limit exceeded"
        );
        for (index, (name, value)) in outputs.iter().enumerate() {
            assert!(valid_name(name), "invalid arithmetic graph output name");
            assert!(
                !outputs[..index].iter().any(|(other, _)| other == name),
                "duplicate graph output name"
            );
            self.value(*value);
        }
        let mut result = String::from(
            "{\"version\":1,\"domain\":\"sora-cars.street-arithmetic.v1\",\"geometryLookup\":\"unqualified\",\"inputs\":[",
        );
        for (index, input) in self.inputs.iter().enumerate() {
            if index != 0 {
                result.push(',');
            }
            write!(
                result,
                "{{\"name\":{},\"node\":{}}}",
                quote(&input.name),
                input.node
            )
            .unwrap();
        }
        result.push_str("],\"nodes\":[");
        for (index, node) in self.nodes.iter().enumerate() {
            if index != 0 {
                result.push(',');
            }
            let fields = match node.op {
                Op::Input(input) => format!("\"op\":\"input\",\"input\":{input}"),
                Op::Constant(value) => format!("\"op\":\"constant\",\"value\":{value}"),
                Op::Add(a, b) => format!("\"op\":\"add\",\"a\":{a},\"b\":{b}"),
                Op::Subtract(a, b) => format!("\"op\":\"subtract\",\"a\":{a},\"b\":{b}"),
                Op::Multiply(a, b) => format!("\"op\":\"multiply\",\"a\":{a},\"b\":{b}"),
                Op::Divide(a, b) => format!("\"op\":\"divide\",\"a\":{a},\"b\":{b}"),
                Op::Remainder(a, divisor) => {
                    format!("\"op\":\"remainder\",\"a\":{a},\"divisor\":{divisor}")
                }
                Op::Less(a, b) => format!("\"op\":\"less\",\"a\":{a},\"b\":{b}"),
                Op::Equal(a, b) => format!("\"op\":\"equal\",\"a\":{a},\"b\":{b}"),
                Op::Select(condition, yes, no) => {
                    format!("\"op\":\"select\",\"condition\":{condition},\"yes\":{yes},\"no\":{no}")
                }
                Op::Geometry(field, progress) => format!(
                    "\"op\":\"geometry\",\"field\":{},\"progress\":{progress}",
                    quote(field.name())
                ),
            };
            write!(
                result,
                "{{{fields},\"low\":{},\"high\":{}}}",
                node.low, node.high
            )
            .unwrap();
        }
        result.push_str("],\"outputs\":[");
        for (index, (name, value)) in outputs.iter().enumerate() {
            if index != 0 {
                result.push(',');
            }
            write!(
                result,
                "{{\"name\":{},\"node\":{}}}",
                quote(name),
                value.index
            )
            .unwrap();
        }
        result.push_str("]}");
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{AssertUnwindSafe, catch_unwind};

    fn geometry_rows() -> Vec<[i64; 8]> {
        (0_i64..=100)
            .map(|i| [i * 5_000, i * 5_000, 0, 0, 5_000, 0, 0, 0])
            .collect()
    }

    #[test]
    fn constant_interning_preserves_first_occurrence_and_existing_source() {
        let mut graph = Graph::new();
        let first = graph.constant(7);
        let input = graph.input("seven", 7, 7);
        let negative = graph.constant(-3);
        let sum = graph.add(first, negative);
        let outputs = [("sum", sum), ("input", input)];
        let source = graph.to_json(&outputs);
        let count = graph.nodes.len();
        for _ in 0..32 {
            assert_eq!(graph.constant(7), first);
            assert_eq!(graph.constant(-3), negative);
        }
        assert_ne!(first.index, input.index, "inputs retain their identity");
        assert_eq!(first.index, 0);
        assert_eq!(negative.index, 2);
        assert_eq!(graph.nodes.len(), count);
        assert_eq!(graph.to_json(&outputs), source);

        let rows = geometry_rows();
        let geometry =
            crate::geometry::StreetGeometry::new(crate::geometry::Topology::Sprint, 500_000, &rows)
                .unwrap();
        let values = graph.evaluate(&[7], &geometry).unwrap();
        assert_eq!(values[sum.index], 4);
        assert_eq!(graph.to_json(&outputs), source, "evaluation is read-only");
        assert!(catch_unwind(AssertUnwindSafe(|| graph.constant(1_i64 << 50))).is_err());
        assert_eq!(
            graph.to_json(&outputs),
            source,
            "invalid constants never alter source"
        );
        let another_sum = graph.add(first, negative);
        assert_ne!(sum.index, another_sum.index, "only constants are interned");
        let second_input = graph.input("another_seven", 7, 7);
        assert_ne!(input.index, second_input.index);
    }

    #[test]
    fn shared_constants_do_not_weaken_eager_narrowed_assertions() {
        let rows = geometry_rows();
        let geometry =
            crate::geometry::StreetGeometry::new(crate::geometry::Topology::Sprint, 500_000, &rows)
                .unwrap();
        let mut graph = Graph::new();
        let flag = graph.input("flag", 0, 1);
        let one = graph.constant(1);
        let zero = graph.constant(0);
        let required = graph.require_true(flag);
        let repeated = graph.require_true(flag);
        let unused_branch = graph.select(zero, required, one);
        assert_ne!(required.index, repeated.index);
        assert_eq!((required.low, required.high), (1, 1));
        assert_eq!(graph.constant(1), one);
        assert_eq!(graph.constant(0), zero);
        assert_eq!(
            (graph.nodes[zero.index].low, graph.nodes[zero.index].high),
            (0, 0)
        );
        assert!(graph.evaluate(&[0], &geometry).is_err());
        assert_eq!(
            graph.evaluate(&[1], &geometry).unwrap()[unused_branch.index],
            1
        );
    }

    #[test]
    fn scalar_operations_match_integer_contract_and_tight_ranges() {
        let rows = geometry_rows();
        let geometry =
            crate::geometry::StreetGeometry::new(crate::geometry::Topology::Sprint, 500_000, &rows)
                .unwrap();
        let mut graph = Graph::new();
        let a = graph.input("a", -17, 19);
        let b = graph.input("b", 1, 7);
        let sum = graph.add(a, b);
        let difference = graph.sub(a, b);
        let product = graph.mul(a, b);
        let quotient = graph.divide(a, b);
        let abs = graph.absolute(a);
        let clamped = graph.clamp(a, -4, 6);
        let minimum = graph.minimum(a, b);
        let maximum = graph.maximum(a, b);
        let remainder = graph.remainder(abs, 5);
        let equal = graph.equal(a, b);
        assert_eq!((clamped.low, clamped.high), (-4, 6));
        assert_eq!((minimum.low, minimum.high), (-17, 7));
        assert_eq!((maximum.low, maximum.high), (1, 19));
        for input_a in -17_i64..=19 {
            for input_b in 1_i64..=7 {
                let actual = graph.evaluate(&[input_a, input_b], &geometry).unwrap();
                for (node, wanted) in [
                    (sum, input_a + input_b),
                    (difference, input_a - input_b),
                    (product, input_a * input_b),
                    (quotient, input_a / input_b),
                    (abs, input_a.abs()),
                    (clamped, input_a.clamp(-4, 6)),
                    (minimum, input_a.min(input_b)),
                    (maximum, input_a.max(input_b)),
                    (remainder, input_a.abs() % 5),
                    (equal, i64::from(u8::from(input_a == input_b))),
                ] {
                    assert_eq!(actual[node.index], wanted);
                }
            }
        }
        assert!(graph.evaluate(&[20, 1], &geometry).is_err());
        assert!(graph.evaluate(&[0], &geometry).is_err());
    }

    #[test]
    fn invalid_builds_and_forged_value_ranges_fail() {
        assert!(catch_unwind(|| Graph::new().constant(1_i64 << 50)).is_err());
        assert!(catch_unwind(|| Graph::new().input("bad", 1, 0)).is_err());
        let mut graph = Graph::new();
        let big = graph.input("big", -(1_i64 << 49), 1_i64 << 49);
        let four = graph.constant(4);
        assert!(catch_unwind(AssertUnwindSafe(|| graph.mul(big, four))).is_err());
        let zero = graph.constant(0);
        assert!(catch_unwind(AssertUnwindSafe(|| graph.divide(big, zero))).is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| graph.remainder(big, 3))).is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| graph.select(four, big, zero))).is_err());
        let forged = Value { high: 1, ..zero };
        assert!(catch_unwind(AssertUnwindSafe(|| graph.add(forged, zero))).is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| graph.input("big", 0, 1))).is_err());
    }

    #[test]
    fn geometry_and_unused_nodes_still_validate() {
        let rows = geometry_rows();
        let geometry =
            crate::geometry::StreetGeometry::new(crate::geometry::Topology::Sprint, 500_000, &rows)
                .unwrap();
        let mut graph = Graph::new();
        let progress = graph.input("progress", -100_000_000, 100_000_000);
        let heading = graph.geometry(GeometryField::Heading, progress);
        let width = graph.geometry(GeometryField::HalfWidth, progress);
        let turn = graph.geometry(GeometryField::IntervalTurn, progress);
        let span = graph.geometry(GeometryField::IntervalSpan, progress);
        for progress in [-100_000_000, -1, 0, 4_999, 500_000, 100_000_000] {
            let actual = graph.evaluate(&[progress], &geometry).unwrap();
            assert_eq!(
                (
                    actual[heading.index],
                    actual[width.index],
                    actual[turn.index],
                    actual[span.index]
                ),
                (0, 5_000, 0, 5_000)
            );
        }
        graph.nodes[width.index].high = 4_999;
        assert!(
            graph.evaluate(&[0], &geometry).is_err(),
            "unused nodes must fail their range assertion"
        );
        assert!(
            graph
                .to_json(&[])
                .contains("\"geometryLookup\":\"unqualified\"")
        );
    }

    #[test]
    fn serialization_escapes_names_and_preserves_input_and_output_order() {
        let mut graph = Graph::new();
        let first = graph.input("空\"\\", -1, 1);
        let second = graph.input("second", 0, 1);
        let json = graph.to_json(&[("result", second), ("first", first)]);
        assert!(json.contains("\"name\":\"空\\\"\\\\\",\"node\":0"));
        assert!(json.ends_with(
            "\"outputs\":[{\"name\":\"result\",\"node\":1},{\"name\":\"first\",\"node\":0}]}"
        ));
        assert!(
            catch_unwind(AssertUnwindSafe(
                || graph.to_json(&[("duplicate", first), ("duplicate", second)])
            ))
            .is_err()
        );
    }
}
