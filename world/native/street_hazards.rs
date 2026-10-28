//! Immutable, bounded roadside interactions for the unqualified street draft.
//!
//! Oil uses start-of-tick footprint occupancy for grip. Swept oil and prop
//! evidence checks every pose on the 65536-subtick integer lattice, including
//! axes stopped at different car/wall contact times. This is neither an AIR
//! nor a solid-object collision solver. Signs and potted saplings are explicit
//! arcade breakaway props: positions and finish times are never changed here.
//! Every car touching an intact prop in the same tick takes its fixed loss;
//! its shared broken bit changes only at tick end, without a slot-order winner.

use crate::graph::{Graph, Value};

pub const SUBTICKS: i64 = 65_536;
pub const MAX_OBJECTS: usize = 16;
pub const CAR_HALF_LENGTH_MM: i64 = 1_800;
pub const CAR_HALF_WIDTH_MM: i64 = 900;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Oil,
    TreePlanter,
    BreakawaySign,
}

impl Kind {
    /// Fixed native effects; authoring data cannot tune collision penalties.
    pub const fn retained_speed_q256(self) -> i64 {
        match self {
            Self::Oil => 256,
            Self::TreePlanter => 160,
            Self::BreakawaySign => 224,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hazard {
    pub kind: Kind,
    pub progress_mm: i64,
    pub lateral_mm: i64,
    pub half_length_mm: i64,
    pub half_width_mm: i64,
}

#[derive(Clone, Debug)]
pub struct Catalog {
    length_mm: i64,
    circuit: bool,
    objects: Vec<Hazard>,
}

impl Catalog {
    /// Indices are immutable object identities; display IDs live in metadata.
    /// Compiler admission additionally checks containment in frozen road width.
    pub fn new(length_mm: i64, circuit: bool, objects: Vec<Hazard>) -> Result<Self, &'static str> {
        if !(500_000..=20_000_000).contains(&length_mm) || objects.len() > MAX_OBJECTS {
            return Err("invalid roadside catalog bounds");
        }
        for object in &objects {
            let dimensions = match object.kind {
                Kind::Oil => {
                    (6_000..=20_000).contains(&object.half_length_mm)
                        && (500..=2_400).contains(&object.half_width_mm)
                }
                Kind::TreePlanter | Kind::BreakawaySign => {
                    (250..=1_500).contains(&object.half_length_mm)
                        && (200..=1_500).contains(&object.half_width_mm)
                }
            };
            if !dimensions || !(-16_000..=16_000).contains(&object.lateral_mm) {
                return Err("invalid roadside object dimensions");
            }
            let begin = 14_000 + object.half_length_mm;
            let end = length_mm - object.half_length_mm - if circuit { 14_000 } else { 6_000 };
            if !(begin..=end).contains(&object.progress_mm) {
                return Err("roadside object overlaps protected start or finish");
            }
            if circuit && 2 * (object.half_length_mm + CAR_HALF_LENGTH_MM + 6_000) >= length_mm {
                return Err("roadside contact image is not unique");
            }
        }
        for (i, a) in objects.iter().enumerate() {
            if a.kind == Kind::Oil {
                continue;
            }
            for b in &objects[i + 1..] {
                if b.kind == Kind::Oil {
                    continue;
                }
                let mut gap = (a.progress_mm - b.progress_mm).abs();
                if circuit {
                    gap = gap.min(length_mm - gap);
                }
                if gap < a.half_length_mm + b.half_length_mm
                    && (a.lateral_mm - b.lateral_mm).abs() < a.half_width_mm + b.half_width_mm
                {
                    return Err("physical breakaway prop rectangles overlap");
                }
            }
        }
        Ok(Self {
            length_mm,
            circuit,
            objects,
        })
    }

    pub fn objects(&self) -> &[Hazard] {
        &self.objects
    }
    pub fn length_mm(&self) -> i64 {
        self.length_mm
    }
    pub fn circuit(&self) -> bool {
        self.circuit
    }
    pub fn mask_limit(&self) -> i64 {
        (1_i64 << self.objects.len()) - 1
    }
}

#[derive(Clone, Copy)]
pub struct HazardMotion {
    pub progress: Value,
    pub lateral: Value,
    /// Original, pre-contact tick displacement, not the resolved endpoint delta.
    pub delta_progress: Value,
    pub delta_lateral: Value,
    pub resolved_progress: Value,
    pub resolved_lateral: Value,
    pub active: Value,
    /// Speed after car/wall response and before roadside prop loss.
    pub speed: Value,
}

pub struct HazardResolution {
    pub speed: Vec<Value>,
    pub oil_contact: Vec<Value>,
    pub oil_entered: Vec<Value>,
    pub oil_exited: Vec<Value>,
    /// Catalog-index bits, including swept oil contact.
    pub contact_masks: Vec<Value>,
    /// Catalog-index bits for impacts against props intact at tick start.
    pub prop_hit_masks: Vec<Value>,
    /// Per-object evidence; oil may hit repeatedly, broken props cannot.
    pub object_hits: Vec<Value>,
    pub broken_mask: Value,
}

#[derive(Clone, Copy)]
struct Axis {
    sign: Value,
    travel: Value,
    denominator: Value,
    maximum: i64,
}
#[derive(Clone, Copy)]
struct Window {
    first: Value,
    last: Value,
    valid: Value,
}

struct Builder<'a>(&'a mut Graph);
impl Builder<'_> {
    fn k(&mut self, n: i64) -> Value {
        self.0.constant(n)
    }
    fn add(&mut self, a: Value, n: i64) -> Value {
        let n = self.k(n);
        self.0.add(a, n)
    }
    fn times(&mut self, a: Value, n: i64) -> Value {
        let n = self.k(n);
        self.0.mul(a, n)
    }
    fn divide(&mut self, a: Value, n: i64) -> Value {
        let n = self.k(n);
        self.0.divide(a, n)
    }
    fn eq(&mut self, a: Value, n: i64) -> Value {
        let n = self.k(n);
        self.0.equal(a, n)
    }
    fn not(&mut self, a: Value) -> Value {
        let one = self.k(1);
        self.0.sub(one, a)
    }
    fn and(&mut self, a: Value, b: Value) -> Value {
        self.0.mul(a, b)
    }
    fn or(&mut self, a: Value, b: Value) -> Value {
        let one = self.k(1);
        self.0.select(a, one, b)
    }
    fn le(&mut self, a: Value, b: Value) -> Value {
        let greater = self.0.less(b, a);
        self.not(greater)
    }
    fn require_if(&mut self, condition: Value, valid: Value) {
        let one = self.k(1);
        let valid = self.0.select(condition, valid, one);
        self.0.require_true(valid);
    }
    fn bounded(&mut self, a: Value, low: i64, high: i64) -> Value {
        let lo = self.k(low);
        let hi = self.k(high);
        let lower = self.le(lo, a);
        let upper = self.le(a, hi);
        self.0.require_true(lower);
        self.0.require_true(upper);
        self.0.clamp(a, low, high)
    }
    fn phase(&mut self, catalog: &Catalog, p: Value) -> Value {
        if catalog.circuit {
            let positive = self.add(p, catalog.length_mm);
            self.0.remainder(positive, catalog.length_mm)
        } else {
            p
        }
    }
    fn offset(&mut self, catalog: &Catalog, phase: Value, station: i64) -> Value {
        let offset = self.add(phase, -station);
        if catalog.circuit {
            let positive = self.add(offset, catalog.length_mm + catalog.length_mm / 2);
            let wrapped = self.0.remainder(positive, catalog.length_mm);
            self.add(wrapped, -(catalog.length_mm / 2))
        } else {
            offset
        }
    }
    fn axis(
        &mut self,
        start: Value,
        delta: Value,
        end: Value,
        active: Value,
        maximum: i64,
    ) -> Axis {
        let zero = self.k(0);
        let one = self.k(1);
        let minus = self.k(-1);
        let negative = self.0.less(delta, zero);
        let sign = self.0.select(negative, minus, one);
        let magnitude = self.0.absolute(delta);
        let resolved = self.0.sub(end, start);
        let travel = self.0.mul(resolved, sign);
        let nonnegative = self.le(zero, travel);
        let bounded = self.le(travel, magnitude);
        self.0.require_true(nonnegative);
        self.0.require_true(bounded);
        let inactive = self.not(active);
        let still = self.eq(resolved, 0);
        let free_still = self.eq(delta, 0);
        self.require_if(inactive, still);
        self.require_if(inactive, free_still);
        let travel = self.0.clamp(travel, 0, maximum);
        let denominator = self.0.maximum(magnitude, one);
        Axis {
            sign,
            travel,
            denominator,
            maximum,
        }
    }
    /// On integer u, the anchored stopped path is exactly
    /// sign(v) * min(final_travel, floor(abs(v)*u/SUBTICKS)).
    /// Solve both inclusive inequalities using integer ceil/floor, without
    /// sampling only endpoints or replacing separately stopped axes by a chord.
    fn window(&mut self, axis: Axis, offset: Value, radius: i64) -> Window {
        let zero = self.k(0);
        let clock = self.k(SUBTICKS);
        let signed_start = self.0.mul(offset, axis.sign);
        let lo = self.k(-radius);
        let hi = self.k(radius);
        let low = self.0.sub(lo, signed_start);
        let high = self.0.sub(hi, signed_start);
        let reachable = self.le(low, axis.travel);
        let not_behind = self.le(zero, high);
        let valid = self.and(reachable, not_behind);
        // Off-path shadow branches are bounded before multiplication/division.
        // On a reachable branch, these clamps preserve the exact inequalities.
        let low = self.0.clamp(low, 0, axis.maximum + 1);
        let numerator = self.times(low, SUBTICKS);
        let numerator = self.0.add(numerator, axis.denominator);
        let numerator = self.add(numerator, -1);
        let first = self.0.divide(numerator, axis.denominator);
        let after_clock = self.k(SUBTICKS + 1);
        let first = self.0.minimum(first, after_clock);
        let saturates_inside = self.le(axis.travel, high);
        let high = self.0.clamp(high, 0, axis.maximum);
        let high = self.add(high, 1);
        let numerator = self.times(high, SUBTICKS);
        let numerator = self.add(numerator, -1);
        let last = self.0.divide(numerator, axis.denominator);
        let last = self.0.select(saturates_inside, clock, last);
        let last = self.0.minimum(last, clock);
        // The combined two-axis interval below also checks each axis for
        // emptiness: max(first_s, first_x) <= min(last_s, last_x).
        Window { first, last, valid }
    }
}

fn position_bounds(p: Value, x: Value, active: Value) {
    assert!(p.low >= -12_000 && p.high <= 80_006_000);
    assert!(x.low >= -16_000 && x.high <= 16_000);
    assert!(active.low >= 0 && active.high <= 1);
}

/// Start-sampled oil grip. Swept feedback additionally exposes corner clips
/// whose two endpoints are outside; large zones cannot rule out every such clip.
pub fn oil_at_start(
    g: &mut Graph,
    catalog: &Catalog,
    progress: Value,
    lateral: Value,
    active: Value,
) -> Value {
    position_bounds(progress, lateral, active);
    let mut b = Builder(g);
    let mut oil = b.k(0);
    let phase = b.phase(catalog, progress);
    for object in &catalog.objects {
        if object.kind != Kind::Oil {
            continue;
        }
        let ds = b.offset(catalog, phase, object.progress_mm);
        let dx = b.add(lateral, -object.lateral_mm);
        let ds = b.0.absolute(ds);
        let dx = b.0.absolute(dx);
        let long = b.k(object.half_length_mm + CAR_HALF_LENGTH_MM);
        let side = b.k(object.half_width_mm + CAR_HALF_WIDTH_MM);
        let inside_s = b.le(ds, long);
        let inside_x = b.le(dx, side);
        let inside = b.and(inside_s, inside_x);
        oil = b.or(oil, inside);
    }
    b.and(oil, active)
}

/// Apply catalog effects after car/wall CCD. Shared breakage is a simultaneous
/// tick-end update. Losses compose in immutable catalog order with truncation;
/// no hit can add speed or alter a position, checkpoint, or finish fraction.
pub fn append(
    g: &mut Graph,
    catalog: &Catalog,
    motions: &[HazardMotion],
    world_broken_mask: Value,
) -> HazardResolution {
    assert!((2..=8).contains(&motions.len()));
    assert!(world_broken_mask.low >= 0 && world_broken_mask.high <= 65_535);
    for m in motions {
        position_bounds(m.progress, m.lateral, m.active);
        position_bounds(m.resolved_progress, m.resolved_lateral, m.active);
        assert!(m.delta_progress.low >= -6_000 && m.delta_progress.high <= 6_000);
        assert!(m.delta_lateral.low >= -32_000 && m.delta_lateral.high <= 32_000);
        assert!(m.speed.low >= 0 && m.speed.high <= 3_000);
    }
    let mut b = Builder(g);
    let zero = b.k(0);
    let old_mask = b.bounded(world_broken_mask, 0, catalog.mask_limit());
    let mut next_mask = old_mask;
    let mut speed: Vec<_> = motions.iter().map(|m| m.speed).collect();
    let mut oil_contact = vec![zero; motions.len()];
    let mut oil_entered = oil_contact.clone();
    let mut oil_exited = oil_contact.clone();
    let mut contact_masks = oil_contact.clone();
    let mut prop_hit_masks = oil_contact.clone();
    let mut object_hits = Vec::new();
    let mut longitudinal = Vec::new();
    let mut lateral = Vec::new();
    let mut phases = Vec::new();
    for m in motions {
        longitudinal.push(b.axis(
            m.progress,
            m.delta_progress,
            m.resolved_progress,
            m.active,
            6_000,
        ));
        lateral.push(b.axis(
            m.lateral,
            m.delta_lateral,
            m.resolved_lateral,
            m.active,
            32_000,
        ));
        phases.push(b.phase(catalog, m.progress));
    }
    for (index, object) in catalog.objects.iter().enumerate() {
        let bit = 1_i64 << index;
        let shifted = b.divide(old_mask, bit);
        let was_broken = b.0.remainder(shifted, 2);
        if object.kind == Kind::Oil {
            let intact = b.not(was_broken);
            b.0.require_true(intact);
        }
        let intact = b.not(was_broken);
        let mut any = zero;
        for (i, m) in motions.iter().enumerate() {
            let ds = b.offset(catalog, phases[i], object.progress_mm);
            let dx = b.add(m.lateral, -object.lateral_mm);
            let s = b.window(
                longitudinal[i],
                ds,
                object.half_length_mm + CAR_HALF_LENGTH_MM,
            );
            let x = b.window(lateral[i], dx, object.half_width_mm + CAR_HALF_WIDTH_MM);
            let first = b.0.maximum(s.first, x.first);
            let last = b.0.minimum(s.last, x.last);
            let valid = b.and(s.valid, x.valid);
            let nonempty = b.le(first, last);
            let hit = b.and(valid, nonempty);
            let hit = b.and(hit, m.active);
            let hit = b.and(hit, intact);
            let bit_hit = b.times(hit, bit);
            contact_masks[i] = b.0.add(contact_masks[i], bit_hit);
            any = b.or(any, hit);
            if object.kind == Kind::Oil {
                oil_contact[i] = b.or(oil_contact[i], hit);
                let at_start = b.eq(first, 0);
                let after_start = b.not(at_start);
                let at_end = b.eq(last, SUBTICKS);
                let before_end = b.not(at_end);
                let entered = b.and(hit, after_start);
                let exited = b.and(hit, before_end);
                oil_entered[i] = b.or(oil_entered[i], entered);
                oil_exited[i] = b.or(oil_exited[i], exited);
            } else {
                prop_hit_masks[i] = b.0.add(prop_hit_masks[i], bit_hit);
                let retained = b.times(speed[i], object.kind.retained_speed_q256());
                let retained = b.divide(retained, 256);
                speed[i] = b.0.select(hit, retained, speed[i]);
            }
        }
        if object.kind != Kind::Oil {
            let bit_hit = b.times(any, bit);
            next_mask = b.0.add(next_mask, bit_hit);
        }
        object_hits.push(any);
    }
    let broken_mask = b.bounded(next_mask, 0, catalog.mask_limit());
    HazardResolution {
        speed,
        oil_contact,
        oil_entered,
        oil_exited,
        contact_masks,
        prop_hit_masks,
        object_hits,
        broken_mask,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{StreetGeometry, Topology};
    fn object(kind: Kind, p: i64, x: i64) -> Hazard {
        Hazard {
            kind,
            progress_mm: p,
            lateral_mm: x,
            half_length_mm: if kind == Kind::Oil { 6000 } else { 250 },
            half_width_mm: if kind == Kind::Oil { 500 } else { 200 },
        }
    }
    fn catalog(objects: Vec<Hazard>, circuit: bool) -> Catalog {
        Catalog::new(500000, circuit, objects).unwrap()
    }
    fn geometry_rows() -> Vec<[i64; 8]> {
        (0..=100)
            .map(|i| [i * 5000, 0, i * 5000, 0, 12000, 0, 0, 0])
            .collect()
    }
    fn build(c: &Catalog, n: usize) -> (Graph, HazardResolution, Vec<Value>) {
        let mut g = Graph::new();
        let mut motions = Vec::new();
        let mut oil = Vec::new();
        let mask = g.input("broken", 0, 65535);
        for i in 0..n {
            let m = HazardMotion {
                progress: g.input(&format!("p{i}"), -12000, 80006000),
                lateral: g.input(&format!("x{i}"), -16000, 16000),
                delta_progress: g.input(&format!("ds{i}"), -6000, 6000),
                delta_lateral: g.input(&format!("dx{i}"), -32000, 32000),
                resolved_progress: g.input(&format!("q{i}"), -12000, 80006000),
                resolved_lateral: g.input(&format!("y{i}"), -16000, 16000),
                active: g.input(&format!("a{i}"), 0, 1),
                speed: g.input(&format!("v{i}"), 0, 3000),
            };
            oil.push(oil_at_start(&mut g, c, m.progress, m.lateral, m.active));
            motions.push(m);
        }
        let result = append(&mut g, c, &motions, mask);
        (g, result, oil)
    }
    fn actor(p: i64, x: i64, ds: i64, dx: i64) -> [i64; 8] {
        [p, x, ds, dx, p + ds, x + dx, 1, 2400]
    }
    fn evaluate(g: &Graph, mask: i64, actors: &[[i64; 8]]) -> Result<Vec<i64>, &'static str> {
        let rows = geometry_rows();
        let geometry = StreetGeometry::new(Topology::Sprint, 500000, &rows).unwrap();
        let inputs = std::iter::once(mask)
            .chain(actors.iter().flatten().copied())
            .collect::<Vec<_>>();
        g.evaluate(&inputs, &geometry)
    }
    #[test]
    fn catalog_rejects_bad_dimensions_margins_and_overlapping_props() {
        let a = object(Kind::BreakawaySign, 50000, 0);
        assert!(Catalog::new(500000, false, vec![a, a]).is_err());
        for bad in [
            Hazard {
                half_width_mm: 199,
                ..a
            },
            Hazard {
                progress_mm: 14249,
                ..a
            },
            Hazard {
                progress_mm: 493751,
                ..a
            },
        ] {
            assert!(Catalog::new(500000, false, vec![bad]).is_err());
        }
        let oil = object(Kind::Oil, 50000, 0);
        assert!(Catalog::new(500000, false, vec![oil, a]).is_ok());
        assert!(
            Catalog::new(
                500000,
                false,
                vec![Hazard {
                    half_length_mm: 5999,
                    ..oil
                }]
            )
            .is_err()
        );
        assert!(Catalog::new(500000, false, vec![oil; 17]).is_err());
        assert_eq!(Kind::TreePlanter.retained_speed_q256(), 160);
        assert_eq!(Kind::BreakawaySign.retained_speed_q256(), 224);
    }
    #[test]
    fn start_oil_and_swept_entry_exit_include_corner_clips() {
        let c = catalog(vec![object(Kind::Oil, 50000, 0)], false);
        let (g, r, oil) = build(&c, 2);
        let far = actor(100000, 0, 0, 0);
        for (a, expected) in [
            (actor(42000, 0, 6000, 0), (0, 1, 0)),
            (actor(55000, 0, 6000, 0), (1, 0, 1)),
            (actor(42000, 1000, 6000, 1000), (0, 1, 1)),
        ] {
            let v = evaluate(&g, 0, &[a, far]).unwrap();
            assert_eq!(
                (
                    v[oil[0].index],
                    v[r.oil_entered[0].index],
                    v[r.oil_exited[0].index]
                ),
                expected
            );
            assert_eq!(v[r.oil_contact[0].index], 1);
            assert_eq!(v[r.speed[0].index], 2400);
            assert_eq!(v[r.broken_mask.index], 0);
        }
        assert!(
            evaluate(&g, 1, &[far, far]).is_err(),
            "oil cannot have a broken bit"
        );
    }
    #[test]
    fn separately_stopped_axes_use_the_anchored_path_not_a_chord() {
        let c = catalog(vec![object(Kind::BreakawaySign, 47000, 0)], false);
        let (g, r, _) = build(&c, 2);
        let mut a = actor(44000, -3000, 6000, 6000);
        a[4] = 45000;
        let v = evaluate(&g, 0, &[a, actor(100000, 0, 0, 0)]).unwrap();
        assert_eq!(v[r.prop_hit_masks[0].index], 1);
        let c = catalog(vec![object(Kind::BreakawaySign, 43500, 0)], false);
        let (g, r, _) = build(&c, 2);
        a[4] = 47000;
        let v = evaluate(&g, 0, &[a, actor(100000, 0, 0, 0)]).unwrap();
        assert_eq!(
            v[r.prop_hit_masks[0].index], 0,
            "a chord would invent this hit"
        );
        let c = catalog(vec![object(Kind::BreakawaySign, 50000, -1000)], false);
        let (g, r, _) = build(&c, 2);
        let mut a = actor(47000, -3000, 6000, 6000);
        a[5] = -2000;
        let v = evaluate(&g, 0, &[a, actor(100000, 0, 0, 0)]).unwrap();
        assert_eq!(v[r.prop_hit_masks[0].index], 1);
    }
    #[test]
    fn simultaneous_breakage_has_no_slot_order_advantage_or_second_hit() {
        let c = catalog(vec![object(Kind::BreakawaySign, 50000, 0)], false);
        let (g, r, _) = build(&c, 2);
        let actors = [actor(47000, -900, 6000, 0), actor(47000, 900, 6000, 0)];
        let v = evaluate(&g, 0, &actors).unwrap();
        assert_eq!(v[r.broken_mask.index], 1);
        assert_eq!(v[r.object_hits[0].index], 1);
        for i in 0..2 {
            assert_eq!(v[r.prop_hit_masks[i].index], 1);
            assert_eq!(v[r.speed[i].index], 2100);
        }
        let again = evaluate(&g, 1, &actors).unwrap();
        for i in 0..2 {
            assert_eq!(again[r.speed[i].index], 2400);
            assert_eq!(again[r.prop_hit_masks[i].index], 0);
        }
        assert_eq!(again[r.broken_mask.index], 1);
        assert!(evaluate(&g, 2, &actors).is_err(), "unknown object bit");
    }
    #[test]
    fn circuit_images_preserve_laps_and_protected_start_seam() {
        let c = catalog(vec![object(Kind::TreePlanter, 20000, 0)], true);
        let (g, r, _) = build(&c, 2);
        let v = evaluate(
            &g,
            0,
            &[actor(517000, 0, 6000, 0), actor(497000, 0, 6000, 0)],
        )
        .unwrap();
        assert_eq!(v[r.prop_hit_masks[0].index], 1);
        assert_eq!(v[r.speed[0].index], 1500);
        assert_eq!(v[r.prop_hit_masks[1].index], 0);
        assert_eq!(v[r.speed[1].index], 2400);
    }
    #[test]
    fn inactive_objects_and_malformed_resolutions_are_checked() {
        let c = catalog(vec![object(Kind::BreakawaySign, 50000, 0)], false);
        let (g, r, _) = build(&c, 2);
        let mut inactive = actor(50000, 0, 0, 0);
        inactive[6] = 0;
        let v = evaluate(&g, 0, &[inactive, actor(100000, 0, 0, 0)]).unwrap();
        assert_eq!(v[r.contact_masks[0].index], 0);
        assert_eq!(v[r.speed[0].index], 2400);
        assert_eq!(v[r.broken_mask.index], 0);
        inactive[2] = 100;
        assert!(evaluate(&g, 0, &[inactive, actor(100000, 0, 0, 0)]).is_err());
        let mut wrong = actor(47000, 0, 6000, 0);
        wrong[4] = 46000;
        assert!(evaluate(&g, 0, &[wrong, actor(100000, 0, 0, 0)]).is_err());
    }

    #[test]
    fn graph_windows_match_every_subtick_of_seeded_signed_stopped_paths() {
        fn next(seed: &mut u64, span: i64) -> i64 {
            *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            (*seed >> 32) as i64 % span
        }
        fn coordinate(start: i64, free: i64, end: i64, u: i64) -> i64 {
            start + free.signum() * (end - start).abs().min(free.abs() * u / SUBTICKS)
        }
        let mut seed = 0x1986_0821_6312_eee7;
        for kind in [Kind::Oil, Kind::BreakawaySign] {
            let object = object(kind, 50000, 0);
            let c = catalog(vec![object], false);
            let (g, result, start_oil) = build(&c, 2);
            let mut observed = 0;
            for case in 0..160 {
                let p = 38000 + next(&mut seed, 24001);
                let x = next(&mut seed, 12001) - 6000;
                let ds = next(&mut seed, 12001) - 6000;
                let dx = next(&mut seed, 20001) - 10000;
                let stop_s = next(&mut seed, SUBTICKS + 1);
                let stop_x = next(&mut seed, SUBTICKS + 1);
                let q = p + ds.signum() * (ds.abs() * stop_s / SUBTICKS);
                let y = x + dx.signum() * (dx.abs() * stop_x / SUBTICKS);
                let a = [p, x, ds, dx, q, y, 1, 2400];
                let contains = |s: i64, x: i64| {
                    (s - object.progress_mm).abs() <= object.half_length_mm + CAR_HALF_LENGTH_MM
                        && (x - object.lateral_mm).abs() <= object.half_width_mm + CAR_HALF_WIDTH_MM
                };
                let hit = (0..=SUBTICKS)
                    .any(|u| contains(coordinate(p, ds, q, u), coordinate(x, dx, y, u)));
                observed += usize::from(hit);
                let actual = evaluate(&g, 0, &[a, actor(100000, 0, 0, 0)]).unwrap();
                assert_eq!(
                    actual[result.contact_masks[0].index],
                    i64::from(hit),
                    "{kind:?} case {case}: {a:?}"
                );
                if kind == Kind::Oil {
                    assert_eq!(actual[start_oil[0].index], i64::from(contains(p, x)));
                    assert_eq!(
                        actual[result.oil_entered[0].index],
                        i64::from(hit && !contains(p, x))
                    );
                    assert_eq!(
                        actual[result.oil_exited[0].index],
                        i64::from(hit && !contains(q, y))
                    );
                }
            }
            assert!(observed > 0, "the oracle must exercise actual contacts");
        }
    }

    #[test]
    fn catalog_owns_its_rows_and_empty_catalog_is_identity() {
        let mut source = vec![object(Kind::Oil, 50000, 0)];
        let captured = catalog(source.clone(), true);
        source[0].progress_mm = 90000;
        assert_eq!(captured.objects()[0].progress_mm, 50000);
        assert_eq!(captured.length_mm(), 500000);
        assert!(captured.circuit());
        let empty = catalog(Vec::new(), false);
        let (g, r, oil) = build(&empty, 2);
        let values = evaluate(
            &g,
            0,
            &[actor(10000, 0, 2000, 0), actor(50000, 0, -2000, 0)],
        )
        .unwrap();
        assert_eq!(values[r.broken_mask.index], 0);
        assert!(r.speed.iter().all(|v| values[v.index] == 2400));
        assert!(oil.iter().all(|v| values[v.index] == 0));
        assert!(r.object_hits.is_empty());
    }
    #[test]
    fn maximum_catalog_graph_cost_is_reported() {
        for kind in [Kind::Oil, Kind::TreePlanter] {
            let c = catalog(
                (0..16)
                    .map(|i| object(kind, 30000 + i * 25000, 0))
                    .collect(),
                true,
            );
            let (g, r, oil) = build(&c, 8);
            let actors: Vec<_> = (0..8)
                .map(|i| actor(10000 + i * 5000, 0, 6000, 0))
                .collect();
            let started = std::time::Instant::now();
            let v = evaluate(&g, 0, &actors).unwrap();
            println!(
                "16 {kind:?},8 cars: {} nodes, {:?}",
                v.len(),
                started.elapsed()
            );
            assert!(v.len() < 18000);
            assert!(r.speed.iter().all(|p| v[p.index] <= 2400));
            assert_eq!(oil.len(), 8);
        }
    }
}
