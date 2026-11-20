import Std

namespace StockMotion

-- Source at 371f95f6 and c076bbd3. Core: execution_proofs/race.rs:118–169 and
-- environment.rs:25–142. AIR: games/race_v1.rs:585–723 and public rows 950–979.
-- This is one live car before contacts. The tick controller handles inactive cars.
structure Car where
  p : Int
  x : Int
  speed : Int
  velocity : Int
  energy : Int
  deriving DecidableEq

structure Object where
  wrapped : Int
  center : Int
  kind : Int
  x : Int

structure Controls where
  boost : Bool
  brake : Bool
  gas : Bool
  right : Bool
  left : Bool
  drift : Bool

structure PublicControls where
  boost : Bool
  acceleration : Int
  steer : Int
  steerHalf : Int

def bit (b : Bool) : Int := if b then 1 else 0
def accel (c : Controls) : Int := if c.brake then -100 else if c.gas then 40 else -12
def rawSteer (c : Controls) : Int :=
  (bit c.right - bit c.left) * (if c.drift then 28 else 18)
def wetSteer (rain : Bool) (s : Int) := if rain then (s*3).tdiv 4 else s
def columns (rain : Bool) (c : Controls) : PublicControls :=
  let s := wetSteer rain (rawSteer c)
  ⟨c.boost, accel c, s, s.tdiv 2⟩

-- Core uses rem_euclid for an object and div_euclid for an unwrapped road station.
-- The AIR's unchecked lap is fixed by its checked cell remainder, including negative grid rows.
theorem objectIndices (p len lap cell : Int)
    (track : len = 2000000 ∨ len = 2400000 ∨ len = 1800000)
    (c : 0 ≤ cell ∧ cell ≤ 11)
    (r : 0 ≤ 12*(p-lap*len)-len*cell ∧ 12*(p-lap*len)-len*cell < len) :
    lap = p / len ∧ p-lap*len = p % len ∧ cell = (p % len)*12 / len := by
  have pos : 0 < len := by rcases track with rfl | rfl | rfl <;> decide
  have bounds : 0 ≤ p-lap*len ∧ p-lap*len < len := by
    rcases track with rfl | rfl | rfl <;> omega
  have quotient : p / len = lap := (Int.ediv_eq_iff_of_pos pos).2 (by omega)
  have splitP := Int.emod_add_ediv_mul p len
  rw [quotient] at splitP
  have wrapped : p - lap*len = p % len := by omega
  refine ⟨quotient.symm,wrapped,?_⟩
  apply Eq.symm
  apply (Int.ediv_eq_iff_of_pos pos).2
  rw [← wrapped, Int.mul_comm cell len, Int.mul_comm _ 12]
  omega

theorem roadIndexInRange (p len n : Int)
    (track : (len = 2000000 ∧ n = 1221) ∨ (len = 2400000 ∧ n = 1461) ∨
      (len = 1800000 ∧ n = 1101)) (lo : -12000 ≤ p) (hi : p ≤ 3*len) :
    0 ≤ (p+100000)/5000 ∧ (p+100000)/5000 < n := by
  rcases track with ⟨rfl,rfl⟩ | ⟨rfl,rfl⟩ | ⟨rfl,rfl⟩ <;> omega

def mag (x : Int) : Int := if x < 0 then -x else x
def clamp (lo hi x : Int) : Int := max lo (min x hi)
def within (x radius : Int) : Bool := decide (x < radius+1 ∧ -radius-1 < x)

theorem withinMatches (x radius : Int) : within x radius = decide (mag x ≤ radius) := by
  unfold within mag
  split <;> rw [decide_eq_decide] <;> omega

def coreOil (obj : Object) (oldX : Int) : Bool :=
  decide (obj.kind = 2 ∧ mag (obj.wrapped-obj.center) ≤ 9000 ∧ mag (oldX-obj.x) ≤ 1400)
def airOil (obj : Object) (oldX : Int) : Bool :=
  (within (obj.wrapped-obj.center) 9000 && within (oldX-obj.x) 1400) && decide (obj.kind = 2)

theorem oilMatches (obj : Object) (oldX : Int) : airOil obj oldX = coreOil obj oldX := by
  simp [airOil,coreOil,withinMatches,Bool.decide_and,Bool.and_comm]

theorem dryDamping (z : Int) : (z*14).tdiv 16 = (z*7).tdiv 8 := by
  have h := Int.mul_tdiv_mul_of_pos_left (z*7) 8 (by decide : (0:Int) < 2)
  simpa [Int.mul_assoc] using h

def coreVelocity (rain oil : Bool) (v raw : Int) : Int :=
  let wet := wetSteer rain raw
  let z := v + (if oil then wet.tdiv 2 else wet)
  let damped := if rain || oil then (z*15).tdiv 16 else (z*7).tdiv 8
  let limit : Int := if rain then 280 else 320
  clamp (-limit) limit damped

def airVelocity (rain oil : Bool) (v steer half : Int) : Int :=
  let z := v + (if oil then half else steer)
  let damped := (z*(14+bit (rain || oil))).tdiv 16
  let limit := 320 - 40*bit rain
  clamp (-limit) limit damped

theorem velocityMatches (rain oil : Bool) (v s : Int) :
    airVelocity rain oil v (wetSteer rain s) ((wetSteer rain s).tdiv 2) =
      coreVelocity rain oil v s := by
  cases rain <;> cases oil <;> simp [airVelocity,coreVelocity,bit,dryDamping]

-- Both readings of the sign of wind*speed are admissible at speed zero.
theorem windSign (wind speed : Int) (nonneg : 0 ≤ speed) (nonzero : wind*speed ≠ 0) :
    wind*speed < 0 ↔ wind < 0 := by
  have pos : 0 < speed := by
    by_cases zero : speed = 0
    · simp [zero] at nonzero
    · omega
  simpa using (Int.mul_lt_mul_right (b:=wind) (c:=0) pos)

def coreDrift (x v k wind speed : Int) : Int :=
  clamp (-6520) 6520 (x + v + ((k*speed*speed).tdiv 16777216 + (wind*speed).tdiv 2400))
def airDrift (x v k wind speed : Int) : Int :=
  clamp (-6520) 6520 (x + v + (k*(speed*speed)).tdiv 16777216 + (wind*speed).tdiv 2400)
theorem driftMatches (x v k wind speed : Int) :
    airDrift x v k wind speed = coreDrift x v k wind speed := by
  simp [airDrift,coreDrift,Int.mul_assoc,Int.add_assoc]

def coreVerge (x s : Int) := if mag x > 6000 then max (s-90) 0 else s
def airVerge (x s : Int) := if 6000 < x ∨ x < -6000 then max (s-90) 0 else s
theorem vergeMatches (x s : Int) : airVerge x s = coreVerge x s := by
  have h : 6000 < x ∨ x < -6000 ↔ mag x > 6000 := by unfold mag; split <;> omega
  simp only [airVerge,coreVerge,h]

def coreImpact (o : Object) (p nextP x speed : Int) :=
  if o.kind ≠ 1 ∨ o.wrapped ≥ o.center ∨ o.wrapped+(nextP-p) < o.center ∨ mag (x-o.x) ≥ 1300
  then speed else max (speed-260) 0
def airImpact (o : Object) (x speed : Int) :=
  if o.kind = 1 ∧ o.wrapped < o.center ∧ o.center ≤ o.wrapped+speed ∧
      -1300 < x-o.x ∧ x-o.x < 1300 then max (speed-260) 0 else speed
theorem impactMatches (o : Object) (p x s : Int) :
    airImpact o x s = coreImpact o p (p+s) x s := by
  unfold airImpact coreImpact mag
  split <;> split <;> split <;> omega

def coreMove (a : Car) (rain : Bool) (wind k : Int) (o : Object) (c : Controls) : Car :=
  let boost := c.boost && decide (a.energy ≥ 25)
  let e := if boost then a.energy-25 else min (a.energy+4) 1000
  let s := clamp 0 (if boost then 3000 else 2400) (a.speed+accel c)
  let v := coreVelocity rain (coreOil o a.x) a.velocity (rawSteer c)
  let x := coreDrift a.x v k wind s
  let s2 := coreVerge x s
  ⟨a.p+s2,x,coreImpact o a.p (a.p+s2) x s2,v,e⟩

def airMove (a : Car) (rain : Bool) (wind k : Int) (o : Object) (i : PublicControls) : Car :=
  let boost := i.boost && decide (25 ≤ a.energy)
  let e := if boost then a.energy-25 else min (a.energy+4) 1000
  let s := clamp 0 (2400+600*bit boost) (a.speed+i.acceleration)
  let v := airVelocity rain (airOil o a.x) a.velocity i.steer i.steerHalf
  let x := airDrift a.x v k wind s
  let s2 := airVerge x s
  ⟨a.p+s2,x,airImpact o x s2,v,e⟩

-- Shared object record and road coefficient come from the selected old position.
-- The control columns must be derived from the admitted control word and public weather.
-- Both functions return the five moved registers, including progress before sign slowdown.
theorem activeCarMove (a : Car) (rain : Bool) (wind k : Int) (o : Object) (c : Controls) :
    airMove a rain wind k o (columns rain c) = coreMove a rain wind k o c := by
  have cap (b : Bool) : (2400+600*bit b : Int) = (if b then 3000 else 2400) := by
    cases b <;> decide
  simp only [airMove,coreMove,columns,cap,oilMatches,velocityMatches,driftMatches,vergeMatches,
    ← impactMatches]
  rfl

-- Source-width check before the i32 rail clamp. The generated ROM headers bound
-- the three tracks by 7826, 7822 and 7805 respectively. The bend product is i64.
theorem forceBudget (k wind speed x velocity : Int) (coef : -7826 ≤ k ∧ k ≤ 7826)
    (weather : -32 ≤ wind ∧ wind ≤ 32) (carSpeed : 0 ≤ speed ∧ speed ≤ 3000)
    (rail : -6520 ≤ x ∧ x ≤ 6520) (drift : -320 ≤ velocity ∧ velocity ≤ 320) :
    -70434000000 ≤ k*(speed*speed) ∧ k*(speed*speed) ≤ 70434000000 ∧
    -96000 ≤ wind*speed ∧ wind*speed ≤ 96000 ∧
    -11078 ≤ x+velocity+((k*(speed*speed)).tdiv 16777216+(wind*speed).tdiv 2400) ∧
    x+velocity+((k*(speed*speed)).tdiv 16777216+(wind*speed).tdiv 2400) ≤ 11078 := by
  have sq0 := Int.mul_nonneg carSpeed.1 carSpeed.1
  have sq := Int.mul_le_mul_of_nonneg_right carSpeed.2 carSpeed.1
  have bendLo := Int.mul_le_mul_of_nonneg_right coef.1 sq0
  have bendHi := Int.mul_le_mul_of_nonneg_right coef.2 sq0
  have windLo := Int.mul_le_mul_of_nonneg_right weather.1 carSpeed.1
  have windHi := Int.mul_le_mul_of_nonneg_right weather.2 carSpeed.1
  have bl : -70434000000 ≤ k*(speed*speed) := by omega
  have bh : k*(speed*speed) ≤ 70434000000 := by omega
  have wl : -96000 ≤ wind*speed := by omega
  have wh : wind*speed ≤ 96000 := by omega
  have b1 := Int.tdiv_le_tdiv (by decide : 0 < (16777216:Int)) bl
  have b2 := Int.tdiv_le_tdiv (by decide : 0 < (16777216:Int)) bh
  have w1 := Int.tdiv_le_tdiv (by decide : 0 < (2400:Int)) wl
  have w2 := Int.tdiv_le_tdiv (by decide : 0 < (2400:Int)) wh
  change -4198 ≤ _ at b1
  change _ ≤ 4198 at b2
  change -40 ≤ _ at w1
  change _ ≤ 40 at w2
  omega

-- The per-car properties needed to initialize contact resolution and the final
-- rail/finish phase. An active car may cross the line before that phase caps progress.
theorem activeBounds (a : Car) (rain : Bool) (wind k : Int) (o : Object) (c : Controls)
    (e0 : 0 ≤ a.energy) (e1 : a.energy ≤ 1000) :
    let m := coreMove a rain wind k o c
    a.p ≤ m.p ∧ m.p ≤ a.p+3000 ∧ -6520 ≤ m.x ∧ m.x ≤ 6520 ∧
      0 ≤ m.speed ∧ m.speed ≤ 3000 ∧ -320 ≤ m.velocity ∧ m.velocity ≤ 320 ∧
      0 ≤ m.energy ∧ m.energy ≤ 1000 := by
  have power (b : Bool) (s : Int) :
      0 ≤ clamp 0 (if b then 3000 else 2400) s ∧
      clamp 0 (if b then 3000 else 2400) s ≤ 3000 := by cases b <;> unfold clamp <;> omega
  have vel (wet oil : Bool) (v steer : Int) :
      -320 ≤ coreVelocity wet oil v steer ∧ coreVelocity wet oil v steer ≤ 320 := by
    cases wet <;> simp only [coreVelocity,Bool.false_eq_true,↓reduceIte] <;> unfold clamp <;> omega
  have side (x v coef air s : Int) :
      -6520 ≤ coreDrift x v coef air s ∧ coreDrift x v coef air s ≤ 6520 := by
    unfold coreDrift clamp; omega
  have verge (x s : Int) (h : 0 ≤ s ∧ s ≤ 3000) :
      0 ≤ coreVerge x s ∧ coreVerge x s ≤ 3000 := by unfold coreVerge; split <;> omega
  have sign (p q x s : Int) (h : 0 ≤ s ∧ s ≤ 3000) :
      0 ≤ coreImpact o p q x s ∧ coreImpact o p q x s ≤ 3000 := by
    unfold coreImpact; split <;> omega
  have energy : 0 ≤ (if c.boost && decide (a.energy ≥ 25) then a.energy-25 else min (a.energy+4) 1000) ∧
      (if c.boost && decide (a.energy ≥ 25) then a.energy-25 else min (a.energy+4) 1000) ≤ 1000 := by
    by_cases requested : c.boost = true <;> by_cases enough : 25 ≤ a.energy <;>
      simp [requested,enough] <;> omega
  unfold coreMove
  dsimp only
  have h1 := power (c.boost && decide (a.energy ≥ 25)) (a.speed+accel c)
  have hv := vel rain (coreOil o a.x) a.velocity (rawSteer c)
  have hx := side a.x (coreVelocity rain (coreOil o a.x) a.velocity (rawSteer c)) k wind
    (clamp 0 (if c.boost && decide (a.energy ≥ 25) then 3000 else 2400) (a.speed+accel c))
  refine ⟨?_,?_,hx.1,hx.2,?_,?_,hv.1,hv.2,energy⟩
  · exact Int.le_add_of_nonneg_right (verge _ _ h1).1
  · exact Int.add_le_add_left (verge _ _ h1).2 _
  · exact (sign _ _ _ _ (verge _ _ h1)).1
  · exact (sign _ _ _ _ (verge _ _ h1)).2

end StockMotion
