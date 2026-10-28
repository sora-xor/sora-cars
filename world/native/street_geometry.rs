//! Proposed native integer geometry helper, outside the maintained Iroha tree.
//! This consumes frozen authoring tables; it is not an AIR or a proof verifier.
//! Column order: progress, east, north, elevation, half_width, heading, curvature, sector.

const MAX_PROGRESS_MM: i64 = 100_000_000;
const JS_SAFE: i64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Topology {
    Circuit,
    Sprint,
}

#[derive(Clone, Copy)]
pub struct StreetGeometry<'a> {
    topology: Topology,
    length_mm: i64,
    road: &'a [[i64; 8]],
}

impl<'a> StreetGeometry<'a> {
    /// Structural integer checks. Historical alignment, geometric quality and
    /// compiled-profile membership are separate admission requirements.
    pub fn new(
        topology: Topology,
        length_mm: i64,
        road: &'a [[i64; 8]],
    ) -> Result<Self, &'static str> {
        if !(500_000..=20_000_000).contains(&length_mm)
            || road.len() != ((length_mm + 4_999) / 5_000 + 1) as usize
        {
            return Err("invalid street table length");
        }
        for (i, row) in road.iter().enumerate() {
            let expected = if i == road.len() - 1 {
                length_mm
            } else {
                (i as i64 * length_mm + (road.len() as i64 - 1) / 2) / (road.len() as i64 - 1)
            };
            if row[0] != expected
                || !(-15_000_000..=15_000_000).contains(&row[1])
                || !(-15_000_000..=15_000_000).contains(&row[2])
                || !(-100_000..=4_000_000).contains(&row[3])
                || !(2_500..=12_000).contains(&row[4])
                || !(-2_000_000..=2_000_000).contains(&row[5])
                || !(-40_000..=40_000).contains(&row[6])
                || !(0..=31).contains(&row[7])
            {
                return Err("invalid street table row");
            }
        }
        let first = road.first().ok_or("missing first sample")?;
        let last = road.last().ok_or("missing last sample")?;
        match topology {
            Topology::Circuit => {
                if (last[5] - first[5]).abs() != 1_000_000
                    || [1, 2, 3, 4, 6, 7]
                        .iter()
                        .any(|&column| first[column] != last[column])
                {
                    return Err("invalid closed street heading");
                }
            }
            Topology::Sprint => {
                let east = last[1] - first[1];
                let north = last[2] - first[2];
                if east * east + north * north < 25_000_000
                    || first[6] != 0
                    || last[6] != 0
                    || last[5] != road[road.len() - 2][5]
                {
                    return Err("invalid sprint endpoint");
                }
            }
        }
        if road.windows(2).any(|rows| {
            (rows[1][5] - rows[0][5]).abs() >= 500_000
                || rows[0][1] == rows[1][1] && rows[0][2] == rows[1][2]
                || (rows[1][5] - rows[0][5]).abs() * rows[0][4].max(rows[1][4]) * 1_000
                    > 79_000_000 * (rows[1][0] - rows[0][0])
        }) {
            return Err("invalid street interval");
        }
        Ok(Self {
            topology,
            length_mm,
            road,
        })
    }

    fn position_at(&self, progress_mm: i64) -> i64 {
        match self.topology {
            Topology::Circuit => progress_mm.rem_euclid(self.length_mm),
            Topology::Sprint => progress_mm.clamp(0, self.length_mm),
        }
    }

    pub fn sample_at(&self, progress_mm: i64) -> Result<&'a [i64; 8], &'static str> {
        if !(-MAX_PROGRESS_MM..=MAX_PROGRESS_MM).contains(&progress_mm) {
            return Err("progress exceeds shared integer bounds");
        }
        let position = self.position_at(progress_mm);
        let index = self.road.partition_point(|row| row[0] <= position) - 1;
        Ok(&self.road[index])
    }

    /// Even at a sprint finish, return the final positive-length cell.
    pub fn interval_at(
        &self,
        progress_mm: i64,
    ) -> Result<(&'a [i64; 8], &'a [i64; 8]), &'static str> {
        let sample = self.sample_at(progress_mm)?;
        let index =
            (self.road.partition_point(|row| row[0] <= sample[0]) - 1).min(self.road.len() - 2);
        Ok((&self.road[index], &self.road[index + 1]))
    }

    pub fn heading_at(&self, progress_mm: i64) -> Result<i64, &'static str> {
        let sample = self.sample_at(progress_mm)?;
        let index = self.road.partition_point(|row| row[0] <= sample[0]) - 1;
        if index == self.road.len() - 1 {
            return Ok(sample[5]);
        }
        let next = &self.road[index + 1];
        let position = self.position_at(progress_mm);
        let lap = match self.topology {
            Topology::Circuit => progress_mm.div_euclid(self.length_mm),
            Topology::Sprint => 0,
        };
        let winding = self.road.last().ok_or("missing last sample")?[5] - self.road[0][5];
        let lap_heading = lap.checked_mul(winding).ok_or("lap heading overflow")?;
        if !(-JS_SAFE..=JS_SAFE).contains(&lap_heading) {
            return Err("lap heading exceeds shared integer bounds");
        }
        // Ordinary signed integer division truncates toward zero, matching TS.
        let offset = (next[5] - sample[5]) * (position - sample[0]) / (next[0] - sample[0]);
        let heading = lap_heading
            .checked_add(sample[5] + offset)
            .ok_or("heading overflow")?;
        if !(-JS_SAFE..=JS_SAFE).contains(&heading) {
            return Err("heading exceeds shared integer bounds");
        }
        Ok(heading)
    }

    pub fn heading_change(&self, from_mm: i64, to_mm: i64) -> Result<i64, &'static str> {
        let change = self
            .heading_at(to_mm)?
            .checked_sub(self.heading_at(from_mm)?)
            .ok_or("heading change overflow")?;
        if !(-JS_SAFE..=JS_SAFE).contains(&change) {
            return Err("heading change exceeds shared integer bounds");
        }
        Ok(change)
    }
}
