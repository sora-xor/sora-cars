//! Draft single-car street handling, authored once as a native arithmetic graph.
//! This is not an admitted execution profile or a complete race relation.
//! Hazard inputs and geometry are public context whose authentication is future work.

use crate::graph::{GeometryField, Graph, Value};

pub const STATE_FIELDS: [&str; 6] = [
    "progressMm",
    "lateralMm",
    "speedMmPerTick",
    "bodyYawMicroturn",
    "velocityYawMicroturn",
    "energy",
];
pub const INPUT_FIELDS: [&str; 11] = [
    "progressMm",
    "lateralMm",
    "speedMmPerTick",
    "bodyYawMicroturn",
    "velocityYawMicroturn",
    "energy",
    "controls",
    "rain",
    "oil",
    "windMmPerTick",
    "active",
];

pub struct Handling {
    pub graph: Graph,
    pub outputs: Vec<(&'static str, Value)>,
}

fn add_c(g: &mut Graph, a: Value, b: i64) -> Value {
    let b = g.constant(b);
    g.add(a, b)
}
fn mul_c(g: &mut Graph, a: Value, b: i64) -> Value {
    let b = g.constant(b);
    g.mul(a, b)
}
fn div_c(g: &mut Graph, a: Value, b: i64) -> Value {
    let b = g.constant(b);
    g.divide(a, b)
}
fn eq_c(g: &mut Graph, a: Value, b: i64) -> Value {
    let b = g.constant(b);
    g.equal(a, b)
}
fn lt_c(g: &mut Graph, a: Value, b: i64) -> Value {
    let b = g.constant(b);
    g.less(a, b)
}

/// Full signed orientation; there is no clamp that automatically follows a bend.
fn wrap(g: &mut Graph, angle: Value) -> Value {
    let positive = add_c(g, angle, 1_000_500_000);
    let remainder = g.remainder(positive, 1_000_000);
    add_c(g, remainder, -500_000)
}

/// Defined fixed-point arcade direction function. Not host trigonometry.
/// Quadrant reduction keeps the largest product below 2^47. Rounded fifth-order
/// sine and fourth-order cosine guards prevent added displacement energy.
pub fn direction(g: &mut Graph, angle: Value) -> (Value, Value) {
    let shifted = add_c(g, angle, 625_000);
    let q = div_c(g, shifted, 250_000);
    let q = add_c(g, q, -2);
    let r = g.remainder(shifted, 250_000);
    let r = add_c(g, r, -125_000);
    let negative = lt_c(g, r, 0);
    let magnitude = g.absolute(r);
    let radians = mul_c(g, magnitude, 25_736);
    let radians = div_c(g, radians, 1_000_000);
    let square = g.mul(radians, radians);
    let cube = g.mul(square, radians);
    let fourth = g.mul(square, square);
    let cubic_term = div_c(g, cube, 100_663_296);
    let square_q = div_c(g, square, 4096);
    let fourth_q = g.mul(square_q, square_q);
    let fifth_q = g.mul(radians, fourth_q);
    let quintic_term = div_c(g, fifth_q, 2_013_265_920);
    let sine = g.sub(radians, cubic_term);
    let sine = g.add(sine, quintic_term);
    let is_zero = eq_c(g, radians, 0);
    let zero = g.constant(0);
    let one = g.constant(1);
    let sine_guard = g.select(is_zero, zero, one);
    let sine = g.sub(sine, sine_guard);
    let sine = g.clamp(sine, 0, 4096);
    let diagonal = eq_c(g, r, -125_000);
    let diagonal_value = g.constant(2896);
    let sine = g.select(diagonal, diagonal_value, sine);
    let negative_sine = g.negate(sine);
    let sine = g.select(negative, negative_sine, sine);
    let quadratic_term = div_c(g, square, 8192);
    let quartic_term = div_c(g, fourth, 1_649_267_441_664);
    let base = g.constant(4096);
    let cosine = g.sub(base, quadratic_term);
    let cosine = g.add(cosine, quartic_term);
    let zero = g.constant(0);
    let two = g.constant(2);
    let guard = g.select(is_zero, zero, two);
    let cosine = g.sub(cosine, guard);
    let cosine = g.clamp(cosine, 0, 4096);
    let cosine = g.select(diagonal, diagonal_value, cosine);
    let negative_sine = g.negate(sine);
    let negative_cosine = g.negate(cosine);
    let q_zero = eq_c(g, q, 0);
    let q_plus = eq_c(g, q, 1);
    let q_minus = eq_c(g, q, -1);
    let sin_outer = g.select(q_minus, negative_cosine, negative_sine);
    let sin_outer = g.select(q_plus, cosine, sin_outer);
    let cos_outer = g.select(q_minus, sine, negative_cosine);
    let cos_outer = g.select(q_plus, negative_sine, cos_outer);
    (
        g.select(q_zero, sine, sin_outer),
        g.select(q_zero, cosine, cos_outer),
    )
}

pub fn build() -> Handling {
    let mut g = Graph::new();
    let progress = g.input(INPUT_FIELDS[0], -12_000, 80_006_000);
    let lateral = g.input(INPUT_FIELDS[1], -16_000, 16_000);
    let speed = g.input(INPUT_FIELDS[2], 0, 3000);
    let body = g.input(INPUT_FIELDS[3], -500_000, 499_999);
    let velocity = g.input(INPUT_FIELDS[4], -500_000, 499_999);
    let energy = g.input(INPUT_FIELDS[5], 0, 1000);
    let controls = g.input(INPUT_FIELDS[6], 0, 63);
    let rain = g.input(INPUT_FIELDS[7], 0, 1);
    let oil = g.input(INPUT_FIELDS[8], 0, 1);
    let wind = g.input(INPUT_FIELDS[9], -32, 32);
    let active = g.input(INPUT_FIELDS[10], 0, 1);
    let outputs = append(
        &mut g,
        [
            progress, lateral, speed, body, velocity, energy, controls, rain, oil, wind, active,
        ],
    );
    Handling { graph: g, outputs }
}

/// Compose the unchanged car arithmetic into a larger native-authored relation.
pub fn append(g: &mut Graph, inputs: [Value; 11]) -> Vec<(&'static str, Value)> {
    append_inner(g, inputs, true)
}

/// Free motion for the multi-car solver; wall events are resolved jointly with
/// car contacts, so pre-clipping the path here would corrupt event times.
pub fn append_free(g: &mut Graph, inputs: [Value; 11]) -> Vec<(&'static str, Value)> {
    append_inner(g, inputs, false)
}

fn append_inner(
    g: &mut Graph,
    inputs: [Value; 11],
    resolve_wall: bool,
) -> Vec<(&'static str, Value)> {
    let [
        progress,
        lateral,
        speed,
        body,
        velocity,
        energy,
        controls,
        rain,
        oil,
        wind,
        active,
    ] = inputs;
    let zero = g.constant(0);
    let one = g.constant(1);
    let mut bits = Vec::new();
    for divisor in [1, 2, 4, 8, 16, 32] {
        let divided = div_c(g, controls, divisor);
        bits.push(g.remainder(divided, 2));
    }
    let brake = bits[1];
    let no_brake = g.sub(one, brake);
    let throttle = g.mul(bits[0], no_brake);
    let steer = g.sub(bits[3], bits[2]);
    let slow = lt_c(g, speed, 650);
    let fast_enough = g.sub(one, slow);
    let drifting = g.mul(bits[4], fast_enough);
    let enough_energy = lt_c(g, energy, 20);
    let enough_energy = g.sub(one, enough_energy);
    let boost_speed = lt_c(g, speed, 301);
    let boost_speed = g.sub(one, boost_speed);
    let boosting = g.mul(bits[5], throttle);
    let boosting = g.mul(boosting, enough_energy);
    let boosting = g.mul(boosting, boost_speed);

    // Body steering gets slower at speed. Throttle provides a bounded arcade
    // crawl-steering response even when a contact removed the previous tick's
    // speed; otherwise repeated bumper contact makes steering unable to escape.
    // Steering alone at rest still cannot rotate the car.
    let speed_factor = mul_c(g, speed, -2);
    let authority = add_c(g, speed_factor, 9000);
    let authority = g.clamp(authority, 1800, 9000);
    let crawl = mul_c(g, throttle, 160);
    let rolling = g.maximum(speed, crawl);
    let rolling = g.clamp(rolling, 0, 600);
    let authority = g.mul(authority, rolling);
    let authority = div_c(g, authority, 600);
    let drift_authority = mul_c(g, authority, 135);
    let drift_authority = div_c(g, drift_authority, 100);
    let authority = g.select(drifting, drift_authority, authority);
    let steering = g.mul(authority, steer);
    let next_body = g.add(body, steering);
    let next_body = wrap(g, next_body);

    // Grip follows the shortest direction from velocity toward the body.
    let standard_grip = g.constant(140);
    let drift_grip = g.constant(32);
    let grip = g.select(drifting, drift_grip, standard_grip);
    let wet_grip = mul_c(g, grip, 3);
    let wet_grip = div_c(g, wet_grip, 4);
    let grip = g.select(rain, wet_grip, grip);
    let oil_grip = g.constant(12);
    let grip = g.select(oil, oil_grip, grip);
    let slip = g.sub(next_body, velocity);
    let slip = wrap(g, slip);
    let yaw_response = g.mul(slip, grip);
    let yaw_response = div_c(g, yaw_response, 256);
    let next_velocity = g.add(velocity, yaw_response);
    let next_velocity = wrap(g, next_velocity);
    // A stopped car has no retained momentum direction. Launch along the body,
    // rather than applying tyre slip against a direction left by a collision.
    let stopped = eq_c(g, speed, 0);
    let next_velocity = g.select(stopped, next_body, next_velocity);
    let slip_after = g.sub(next_body, next_velocity);
    let slip_after = wrap(g, slip_after);
    let slip_magnitude = g.absolute(slip_after);

    let drag = div_c(g, speed, 250);
    let drag = add_c(g, drag, 6);
    let slip_drag = div_c(g, slip_magnitude, 1200);
    let drag = g.add(drag, slip_drag);
    let acceleration = mul_c(g, throttle, 34);
    let braking = mul_c(g, brake, 96);
    let surge = mul_c(g, boosting, 70);
    let next_speed = g.add(speed, acceleration);
    let next_speed = g.add(next_speed, surge);
    let next_speed = g.sub(next_speed, braking);
    let next_speed = g.sub(next_speed, drag);
    let next_speed = g.clamp(next_speed, 0, 3000);
    // Let boost speed decay after release instead of instantly clipping it.
    let normal_cap = add_c(g, speed, -30);
    let normal_cap = g.clamp(normal_cap, 2400, 3000);
    let boost_cap = g.constant(3000);
    let cap = g.select(boosting, boost_cap, normal_cap);
    let next_speed = g.minimum(next_speed, cap);
    let regenerated = add_c(g, energy, 3);
    let regenerated = g.clamp(regenerated, 0, 1000);
    let spent = add_c(g, energy, -20);
    let next_energy = g.select(boosting, spent, regenerated);
    let next_energy = g.clamp(next_energy, 0, 1000);

    let (sin, cos) = direction(g, next_velocity);
    let forward = g.mul(next_speed, cos);
    let forward = div_c(g, forward, 4096);
    let sideways = g.mul(next_speed, sin);
    let sideways = div_c(g, sideways, 4096);
    // Explicit first-order road-coordinate radius correction. It is not an
    // exact Cartesian integrator. Adjacent frozen headings are authoritative.
    let turn = g.geometry(GeometryField::IntervalTurn, progress);
    let span = g.geometry(GeometryField::IntervalSpan, progress);
    let radius = g.mul(turn, lateral);
    let radius = mul_c(g, radius, 25_736);
    let denominator = mul_c(g, span, 1_000_000);
    let radius = g.divide(radius, denominator);
    let base = g.constant(4096);
    let radius = g.sub(base, radius);
    let radius = g.clamp(radius, 2048, 6144);
    let distance = mul_c(g, forward, 4096);
    let distance = g.divide(distance, radius);
    let next_progress = g.add(progress, distance);
    let next_progress = g.clamp(next_progress, -12_000, 80_006_000);
    let distance = g.sub(next_progress, progress);
    let distance = g.clamp(distance, -6000, 6000);

    // Transform BOTH orientations by exactly the same road rotation once.
    let heading_before = g.geometry(GeometryField::Heading, progress);
    let heading_after = g.geometry(GeometryField::Heading, next_progress);
    let road_rotation = g.sub(heading_after, heading_before);
    let next_body = g.sub(next_body, road_rotation);
    let next_body = wrap(g, next_body);
    let next_velocity = g.sub(next_velocity, road_rotation);
    let next_velocity = wrap(g, next_velocity);
    let moving = eq_c(g, next_speed, 0);
    let moving = g.sub(one, moving);
    let moving_wind = g.mul(wind, moving);
    let next_lateral = g.add(lateral, sideways);
    let next_lateral = g.add(next_lateral, moving_wind);
    let (next_lateral, next_speed, next_velocity, wall_contact) = if resolve_wall {
        let old_width = g.geometry(GeometryField::HalfWidth, progress);
        let new_width = g.geometry(GeometryField::HalfWidth, next_progress);
        // A tick advances at most 6000 mm; every cell is at least 4900 mm.
        // Start/middle/end therefore sample every crossed cell, including a
        // narrower cell skipped by both endpoints. This is a conservative envelope
        // for the linear lateral segment, not time-of-impact collision resolution.
        let half_distance = div_c(g, distance, 2);
        let middle = g.add(progress, half_distance);
        let middle = g.clamp(middle, -12_000, 80_006_000);
        let middle_width = g.geometry(GeometryField::HalfWidth, middle);
        let width = g.minimum(old_width, new_width);
        let width = g.minimum(width, middle_width);
        let limit = add_c(g, width, -900);
        let magnitude = g.absolute(next_lateral);
        let old_magnitude = g.absolute(lateral);
        let magnitude = g.maximum(magnitude, old_magnitude);
        let wall_contact = g.less(limit, magnitude);
        let low_limit = g.negate(limit);
        let next_lateral = g.maximum(next_lateral, low_limit);
        let next_lateral = g.minimum(next_lateral, limit);
        // Preserve signed tangent momentum: removing lateral motion must not turn
        // sideways/reverse travel into forward speed. Then dissipate 25% more.
        let (_, tangent) = direction(g, next_velocity);
        let projected = g.mul(next_speed, tangent);
        let projected = div_c(g, projected, 4096);
        let backwards = lt_c(g, projected, 0);
        let reverse = g.constant(-500_000);
        let wall_velocity = g.select(backwards, reverse, zero);
        let wall_speed = g.absolute(projected);
        let wall_speed = mul_c(g, wall_speed, 3);
        let wall_speed = div_c(g, wall_speed, 4);
        let next_speed = g.select(wall_contact, wall_speed, next_speed);
        let next_velocity = g.select(wall_contact, wall_velocity, next_velocity);

        (next_lateral, next_speed, next_velocity, wall_contact)
    } else {
        (next_lateral, next_speed, next_velocity, zero)
    };

    let previous = [progress, lateral, speed, body, velocity, energy];
    let next = [
        next_progress,
        next_lateral,
        next_speed,
        next_body,
        next_velocity,
        next_energy,
    ];
    let mut outputs = Vec::new();
    for (name, (after, before)) in STATE_FIELDS.iter().zip(next.into_iter().zip(previous)) {
        outputs.push((*name, g.select(active, after, before)));
    }
    for (name, value) in [
        ("drifting", drifting),
        ("boosting", boosting),
        ("slipMicroturn", slip_after),
        ("wallContact", wall_contact),
        ("distanceMm", distance),
        ("roadRotationMicroturn", road_rotation),
    ] {
        outputs.push((name, g.select(active, value, zero)));
    }
    outputs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{StreetGeometry, Topology};

    fn straight() -> Vec<[i64; 8]> {
        (0..=100)
            .map(|i| [i * 5000, 0, i * 5000, 0, 12000, 0, 0, 0])
            .collect()
    }

    #[test]
    fn direction_exhaustive_norm_symmetry_and_cardinals() {
        let road = straight();
        let geo = StreetGeometry::new(Topology::Sprint, 500000, &road).unwrap();
        let mut graph = Graph::new();
        let angle = graph.input("angle", -500000, 499999);
        let (sin, cos) = direction(&mut graph, angle);
        for yaw in -500000..500000 {
            let nodes = graph.evaluate(&[yaw], &geo).unwrap();
            let (s, c) = (nodes[sin.index], nodes[cos.index]);
            assert!(s * s + c * c <= 4096 * 4096, "norm at {yaw}: {s},{c}");
            if (-499999..0).contains(&yaw) {
                let other = graph.evaluate(&[-yaw], &geo).unwrap();
                assert_eq!(s, -other[sin.index], "sine at {yaw}");
                assert_eq!(c, other[cos.index], "cosine at {yaw}");
            }
            if yaw % 250000 == 0 {
                let expected = match yaw {
                    -500000 => (0, -4096),
                    -250000 => (-4096, 0),
                    0 => (0, 4096),
                    250000 => (4096, 0),
                    _ => unreachable!(),
                };
                assert_eq!((s, c), expected);
            }
        }
    }

    #[test]
    fn graph_builds_and_every_control_decodes() {
        let road = straight();
        let geo = StreetGeometry::new(Topology::Sprint, 500000, &road).unwrap();
        let handling = build();
        for controls in 0..64 {
            let values = handling
                .graph
                .evaluate(&[100000, 0, 2400, 0, 0, 1000, controls, 0, 0, 0, 1], &geo)
                .unwrap();
            assert!(
                handling
                    .outputs
                    .iter()
                    .all(|(_, output)| values[output.index] >= output.low
                        && values[output.index] <= output.high)
            );
        }
    }
}
