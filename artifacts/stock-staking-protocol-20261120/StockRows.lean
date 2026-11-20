import Std

namespace StockRows

-- Every car contributes these seven integer registers. The removal tick is a public sidecar.
structure Car where
  p : Int
  x : Int
  s : Int
  v : Int
  e : Int
  finish : Option Nat
  deriving DecidableEq

structure Reg where
  p : Int
  x : Int
  s : Int
  v : Int
  e : Int
  done : Bool
  stamp : Nat
  deriving DecidableEq

def pack (c : Car) : Reg :=
  ⟨c.p,c.x,c.s,c.v,c.e,c.finish.isSome,c.finish.getD 0⟩

def unpack (r : Reg) : Car := ⟨r.p,r.x,r.s,r.v,r.e,if r.done then some r.stamp else none⟩
theorem roundTrip (c : Car) : unpack (pack c) = c := by
  obtain ⟨p,x,s,v,e,f⟩ := c; cases f <;> rfl
theorem completeRegisters (a b : Car) (h : pack a = pack b) : a = b := by
  simpa [roundTrip] using congrArg unpack h

def grid (slot : Fin 8) : Car :=
  ⟨-(Int.ofNat (slot.val/2))*4000, if slot.val%2=0 then -1800 else 1800,0,0,1000,none⟩

def invariant (line : Int) (tick : Nat) (c : Car) : Prop :=
  -12000 ≤ c.p ∧ c.p ≤ line ∧ -6520 ≤ c.x ∧ c.x ≤ 6520 ∧
  0 ≤ c.s ∧ c.s ≤ 3000 ∧ -320 ≤ c.v ∧ c.v ≤ 320 ∧ 0 ≤ c.e ∧ c.e ≤ 1000 ∧
  ∀ t, c.finish = some t → 0<t ∧ t≤tick ∧ c.p=line

theorem gridValid (slot : Fin 8) (line : Int) (positive : 0 ≤ line) : invariant line 0 (grid slot) := by
  have h := slot.isLt
  simp [invariant,grid]; split <;> omega

def rail (x : Int) := max (-6520) (min 6520 x)
theorem railBounds (x : Int) : -6520 ≤ rail x ∧ rail x ≤ 6520 := by unfold rail; omega
theorem railIdentity (x : Int) (lo : -6520 ≤ x) (hi : x ≤ 6520) : rail x = x := by unfold rail; omega

-- The native final pass clamps all lateral values, then stamps a live crossing.
-- post holds the moved values and ordered contacts BEFORE the last rail/finish pass.
def coreEnd (tick : Nat) (line : Int) (removed : Bool) (old post : Car) : Car :=
  if old.finish.isSome || removed then {old with x := rail old.x}
  else ⟨min post.p line,rail post.x,post.s,post.v,post.e,if line ≤ post.p then some (tick+1) else none⟩

-- The installed register expressions, with the Builder::finish active gate made explicit.
def airEnd (active removed : Bool) (tick : Nat) (line : Int) (old : Reg) (post : Car) : Reg :=
  let live := !old.done && !removed
  let crossed := live && active && !decide (post.p < line)
  let computed : Reg := ⟨if live then min post.p line else old.p,
    if live then rail post.x else old.x, if live then post.s else old.s,
    if live then post.v else old.v, if live then post.e else old.e,
    old.done || crossed, old.stamp + (if crossed then tick+1 else 0)⟩
  if active then computed else old

theorem finishMatches (removed : Bool) (tick : Nat) (line : Int) (a post : Car)
    (h : invariant line tick a) : airEnd true removed tick line (pack a) post =
      pack (coreEnd tick line removed a post) := by
  obtain ⟨p,x,s,v,e,f⟩ := a
  obtain ⟨_,_,lx,hx,_⟩ := h
  have fixed := railIdentity x lx hx
  cases f <;> cases removed <;> by_cases passed : line ≤ post.p <;>
    simp [airEnd,coreEnd,pack,fixed,passed,show (post.p < line) ↔ ¬line ≤ post.p by omega]

theorem paddingHolds (r : Reg) (post : Car) (d : Bool) (i : Nat) (l : Int) :
    airEnd false d i l r post = r := rfl

def candidateBounds (post : Car) : Prop :=
  -12000 ≤ post.p ∧ 0 ≤ post.s ∧ post.s ≤ 3000 ∧ -320 ≤ post.v ∧ post.v ≤ 320 ∧
  0 ≤ post.e ∧ post.e ≤ 1000

theorem endPreserves (rem : Bool) (tick : Nat) (line : Int) (c post : Car)
    (hl : 0 ≤ line) (good : invariant line tick c) (hpost : candidateBounds post) :
    invariant line (tick+1) (coreEnd tick line rem c post) := by
  have ⟨_,_,lo,hi,_,_,_,_,_,_,hf⟩ := good
  have r := railBounds post.x
  have f := railIdentity c.x lo hi
  unfold invariant at good ⊢; unfold candidateBounds at hpost
  unfold coreEnd
  split
  · simp [f]; grind
  · by_cases passed : line ≤ post.p <;> simp [passed] <;> omega

-- Two signed implementations treat simultaneous car contacts in increasing original-slot pairs.
-- x,y here are arbitrary intermediate lateral positions, before the final rail clamp.
def mag (x : Int) := if x < 0 then -x else x
def coreHit (pi pj xi xj : Int) : Prop := mag (pi-pj) < 3600 ∧ mag (xi-xj) < 1800
def airHit (pi pj xi xj : Int) : Prop :=
  pi-pj < 3600 ∧ -3600 < pi-pj ∧ (if xi-xj < 1 then -(xi-xj) else xi-xj) < 1800

theorem contactGuard (pi pj xi xj : Int) : coreHit pi pj xi xj ↔ airHit pi pj xi xj := by
  unfold coreHit airHit mag; repeat split <;> omega

def nativeShift (x y : Int) : Int :=
  let push := (1800-mag (x-y)+1)/2
  if x ≤ y then -push else push
def circuitShift (x y : Int) : Int :=
  let left := decide (x-y < 1)
  let distance := if left then -(x-y) else x-y
  let push := (1801-distance)/2
  push * (1 - (if left then 2 else 0))

theorem shiftMatches (x y : Int) : nativeShift x y = circuitShift x y := by
  by_cases h : x ≤ y
  · have H : x-y < 1 := by omega
    have hmag : mag (x-y) = -(x-y) := by unfold mag; split <;> omega
    simp [nativeShift,circuitShift,h,H,hmag]; omega
  · have H : ¬x-y < 1 := by omega
    have hmag : mag (x-y) = x-y := by unfold mag; split <;> omega
    simp [nativeShift,circuitShift,h,H,hmag]; omega

theorem oneSlow (s : Int) (k : Nat) :
    max 0 (max 0 (s-120*k)-120) = max 0 (s-120*(k+1)) := by omega

abbrev Slot := Fin 8
structure CorePairs where
  x : Slot → Int
  speed : Slot → Int
structure AirPairs where
  x : Slot → Int
  count : Slot → Nat

def related (live : Slot → Bool) (base : Slot → Int) (c : CorePairs) (a : AirPairs) : Prop :=
  ∀ k, live k → c.x k = a.x k ∧ c.speed k = max 0 (base k-120*(a.count k))

def pairCore (p : Slot → Int) (live : Slot → Bool) (i j : Slot) (c : CorePairs) : CorePairs :=
  if live i && live j then
    if mag (p i-p j)<3600 ∧ mag (c.x i-c.x j)<1800 then
      ⟨fun k => if k=i then c.x k + nativeShift (c.x i) (c.x j) else
                 if k=j then c.x k - nativeShift (c.x i) (c.x j) else c.x k,
       fun k => if k=i ∨ k=j then max 0 (c.speed k-120) else c.speed k⟩
    else c
  else c

def pairAir (p : Slot → Int) (live : Slot → Bool) (i j : Slot) (a : AirPairs) : AirPairs :=
  if live i && live j then
    if p i-p j < 3600 ∧ -3600 < p i-p j ∧
        (if a.x i-a.x j < 1 then -(a.x i-a.x j) else a.x i-a.x j) < 1800 then
      ⟨fun k => if k=i then a.x k + circuitShift (a.x i) (a.x j) else
                 if k=j then a.x k - circuitShift (a.x i) (a.x j) else a.x k,
       fun k => if k=i ∨ k=j then a.count k+1 else a.count k⟩
    else a
  else a

theorem pairPreserves (p base : Slot → Int) (live : Slot → Bool) (i j : Slot)
    (c : CorePairs) (a : AirPairs) (h : related live base c a) :
    related live base (pairCore p live i j c) (pairAir p live i j a) := by
  cases hi : live i <;> cases hj : live j <;> simp [pairCore,pairAir,hi,hj] <;> try exact h
  have xi := (h i hi).1; have xj := (h j hj).1
  have H := contactGuard (p i) (p j) (a.x i) (a.x j)
  unfold coreHit airHit at H
  simp only [xi,xj,H,shiftMatches]
  by_cases contact : p i-p j < 3600 ∧ -3600 < p i-p j ∧
      (if a.x i-a.x j < 1 then -(a.x i-a.x j) else a.x i-a.x j) < 1800
  · simp only [if_pos contact]
    intro k hk
    obtain ⟨xk,sk⟩ := h k hk
    by_cases hit : k=i ∨ k=j <;> simp [hit,xk,sk,oneSlow]
  · simpa only [if_neg contact] using h

theorem orderedContacts (pairs : List (Slot × Slot)) (p base : Slot → Int)
    (live : Slot → Bool) (c : CorePairs) (a : AirPairs) (h : related live base c a) :
    related live base
      (pairs.foldl (fun u ij => pairCore p live ij.1 ij.2 u) c)
      (pairs.foldl (fun u ij => pairAir p live ij.1 ij.2 u) a) := by
  induction pairs generalizing c a with
  | nil => exact h
  | cons ij rest ih => exact ih _ _ (pairPreserves p base live ij.1 ij.2 c a h)

theorem initialPairs (live : Slot → Bool) (x s : Slot → Int)
    (nonneg : ∀ k, live k → 0 ≤ s k) :
    related live s ⟨x,s⟩ ⟨x,fun _ => 0⟩ := by
  intro k hk; have := nonneg k hk; simp; omega


-- Induction over any finite trace. There is no transition from the last domain row to row zero.
def run {S : Type} (f : Nat → S → S) (z : S) : Nat → S
  | 0 => z
  | n+1 => f n (run f z n)

theorem paddedExecution {S : Type} (f : Nat → S → S) (rows terminal : Nat)
    (trace : Nat → S) (z : S) (initial : trace 0 = z)
    (step : ∀ t, t+1 < rows → trace (t+1) = if t<terminal then f t (trace t) else trace t) :
    ∀ t, t < rows → trace t = run f z (min t terminal) := by
  intro t
  induction t with
  | zero => intro _; simpa [run] using initial
  | succ t ih =>
    intro inside
    rw [step t inside, ih (by omega)]
    by_cases live : t < terminal
    · have eq : min (t+1) terminal = t+1 := by omega
      have eq' : min t terminal = t := by omega
      simp [live,eq,eq',run]
    · have eq : min (t+1) terminal = terminal := by omega
      have eq' : min t terminal = terminal := by omega
      simp [live,eq,eq']

theorem selectedRow {S : Type} (f : Nat → S → S) (z : S)
    (rows terminal t : Nat) (trace : Nat → S) (expected : S)
    (initial : trace 0 = z) (hstep : ∀ q, q+1 < rows →
      trace (q+1) = if q<terminal then f q (trace q) else trace q)
    (inside : t < rows) (before : t ≤ terminal) (selected : trace t = expected) :
    expected = run f z t := by
  have eq := paddedExecution f rows terminal trace z initial hstep t inside
  simpa [selected,Nat.min_eq_left before] using eq

theorem layout (steps : Nat) (h : steps ≤ 8100) : steps < 8192 ∧
    (∀ r, r<steps → r+1<8192) ∧ (∀ r, steps ≤ r → r+1 < 8192 → ¬r<steps) := by
  constructor
  · omega
  · constructor <;> intros <;> omega

def isLive (r : Reg) (d : Bool) := !r.done && !d
def liveCount (roster : List (Reg × Bool)) :=
  (roster.filter (fun pair => isLive pair.1 pair.2)).length

theorem liveCountNonzero (roster : List (Reg × Bool)) :
    liveCount roster ≠ 0 ↔ ∃ pair ∈ roster, pair.1.done = false ∧ pair.2 = false := by
  simp [liveCount,isLive, List.length_eq_zero_iff, List.filter_eq_nil_iff]

def nEligible (roster : List (Reg × Bool)) := (roster.filter (fun x => !x.2)).length

-- Since admitted native races have at least two seats, the public and AIR tests are conjuncts.
theorem terminalBoundary (roster : List (Reg × Bool)) :
    (2 ≤ nEligible roster ∧ liveCount roster ≠ 0) ↔
    ¬ ((∀ p ∈ roster, p.1.done = true ∨ p.2 = true) ∨ nEligible roster < 2) := by
  rw [liveCountNonzero]
  constructor
  · rintro ⟨h,⟨p,hp,hd,hr⟩⟩ (all | few)
    · have := all p hp; simp_all
    · omega
  · intro h
    have hcount : 2 ≤ nEligible roster := by omega
    refine ⟨hcount,?_⟩
    apply Classical.byContradiction
    intro empty
    apply h
    left
    intro p hp
    cases a : p.1.done <;> cases b : p.2 <;> simp_all

def beforeRemoval (r : Option Nat) (t : Nat) := r.filter (fun k => decide (k<t))
def stepRemoval (r : Option Nat) (t : Nat) := r.filter (fun k => decide (k≤t))

theorem checkpointBeforeTick (r : Option Nat) (t : Nat) :
    beforeRemoval r (t+1) = stepRemoval r t := by
  cases r with
  | none => rfl
  | some k => by_cases h : k ≤ t <;> simp [beforeRemoval,stepRemoval,Option.filter,h,show k<t+1 ↔ k≤t by omega]

theorem sameTickOnly (r : Option Nat) (t : Nat) :
    beforeRemoval r t ≠ stepRemoval r t ↔ r = some t := by
  cases r with
  | none => simp [beforeRemoval,stepRemoval]
  | some k =>
    by_cases eq : k=t
    · subst k; simp [beforeRemoval,stepRemoval,Option.filter]
    · by_cases low : k<t
      · have le : k≤t := by omega
        simp [beforeRemoval,stepRemoval,Option.filter,low,le,eq]
      · have le : ¬k≤t := by omega
        simp [beforeRemoval,stepRemoval,Option.filter,low,le,eq]

def P : Int := 18446744069414584321

-- State columns are field words. Their next bounded representative need not be presumed: the
-- transition itself identifies their residue with the computed value.
theorem activeGateWord (next cur step : Int) (active : Bool)
    (h : (next-cur-(if active then (1:Int) else 0)*(step-cur)) % P = 0) :
    next % P = (if active then step else cur) % P := by
  cases active <;> simp [P] at * <;> omega

theorem selectedWord (r pin : Int) (h : (r-pin) % P = 0) : r % P = pin % P := by
  unfold P at *; omega

theorem smallPinUnique (x y : Int) (lx : -2^60 ≤ x) (ux : x ≤ 2^60)
    (ly : -2^60 ≤ y) (uy : y ≤ 2^60) (eq : x % P = y % P) : x=y := by
  unfold P at eq; omega

-- The active-row premise applies only to the reached Core state. The raw AIR row is never
-- assumed to have a bounded integer decode before induction identifies its encoding.
theorem embeddedExecution {S F : Type} (encode : S → F) (core : Nat → S → S)
    (initial : S) (rows steps : Nat) (raw : Nat → F)
    (origin : raw 0 = encode initial)
    (activeStep : ∀ i, i<steps → i+1<rows → raw i = encode (run core initial i) →
        raw (i+1) = encode (core i (run core initial i)))
    (padding : ∀ i, steps≤i → i+1<rows → raw (i+1) = raw i) :
    ∀ r, r<rows → raw r = encode (run core initial (min r steps)) := by
  intro r
  induction r with
  | zero => intro _; simpa [run] using origin
  | succ r ih =>
    intro inside
    have prev := ih (by omega)
    by_cases h : r<steps
    · have l : min r steps = r := by omega
      have l' : min (r+1) steps = r+1 := by omega
      rw [l',run]
      exact activeStep r h inside (by simpa [l] using prev)
    · have l : min r steps = steps := by omega
      have l' : min (r+1) steps = steps := by omega
      rw [l',padding r (by omega) inside]
      simpa [l] using prev


def withContact (m : Car) (x speed : Int) : Car := {m with x := x, s := speed}
def liveFlag (c : Car) (r : Bool) : Bool := !c.finish.isSome && !r

theorem initialPairsLive (live : Slot → Bool) (mc ma : Slot → Car)
    (same : ∀ i, live i → mc i = ma i) (speedBound : ∀ i, live i → 0≤(mc i).s) :
    related live (fun i => (ma i).s) ⟨fun i => (mc i).x,fun i => (mc i).s⟩
       ⟨fun i => (ma i).x,fun _ => 0⟩ := by
  intro i hi
  have h := speedBound i hi
  rw [same i hi] at h
  simp [same i hi]; omega

-- Compose arbitrary many ordered pair operations with every field in the emitted seven-register
-- commit. Inactive scratch values may differ arbitrarily between the two implementations.
theorem liveAndFrozenCar (old mc ma : Slot → Car) (d : Slot → Bool)
    (cc : CorePairs) (aa : AirPairs) (tick : Nat) (line : Int)
    (valid : ∀ i, invariant line tick (old i))
    (same : ∀ i, liveFlag (old i) (d i) → mc i = ma i)
    (relatedPairs : related (fun i => liveFlag (old i) (d i)) (fun i => (ma i).s) cc aa)
    (i : Slot) :
    airEnd true (d i) tick line (pack (old i))
      (withContact (ma i) (aa.x i) (max 0 ((ma i).s - 120*(aa.count i)))) =
    pack (coreEnd tick line (d i) (old i) (withContact (mc i) (cc.x i) (cc.speed i))) := by
  rw [finishMatches _ _ _ _ _ (valid i)]
  by_cases live : liveFlag (old i) (d i) = true
  · obtain ⟨hx,hs⟩ := relatedPairs i live
    rw [hx,hs,same i live]
  · have dead : ((old i).finish.isSome || d i) = true := by
      cases hf : (old i).finish <;> cases hd : d i <;> simp_all [liveFlag]
    simp [coreEnd,dead]

-- Source-reachable integer range propagation across an arbitrary number of steps.
theorem rangesAlongRun (line : Int) (lpos : 0≤line) (slot : Fin 8)
    (removed : Nat → Bool) (post : Nat → Car → Car)
    (candidate : ∀ t c, invariant line t c → candidateBounds (post t c)) :
    ∀ t, invariant line t (run (fun i c => coreEnd i line (removed i) c (post i c)) (grid slot) t) := by
  intro t
  induction t with
  | zero => exact gridValid slot line lpos
  | succ t ih => exact endPreserves _ _ _ _ _ lpos ih (candidate _ _ ih)


theorem allPairsAndCommit (old mc ma : Slot → Car) (d : Slot → Bool)
    (pairs : List (Slot × Slot)) (tick : Nat) (line : Int)
    (valid : ∀ i, invariant line tick (old i))
    (same : ∀ i, liveFlag (old i) (d i) → mc i = ma i)
    (nonnegative : ∀ i, liveFlag (old i) (d i) → 0 ≤ (mc i).s) (i : Slot) :
    let live := fun k => liveFlag (old k) (d k)
    let progress := fun k => (mc k).p
    let coreAfter := pairs.foldl (fun u ij => pairCore progress live ij.1 ij.2 u)
      (⟨fun k => (mc k).x,fun k => (mc k).s⟩ : CorePairs)
    let airAfter := pairs.foldl (fun u ij => pairAir progress live ij.1 ij.2 u)
      (⟨fun k => (ma k).x,fun _ => 0⟩ : AirPairs)
    airEnd true (d i) tick line (pack (old i))
      (withContact (ma i) (airAfter.x i) (max 0 ((ma i).s-120*(airAfter.count i)))) =
    pack (coreEnd tick line (d i) (old i) (withContact (mc i) (coreAfter.x i) (coreAfter.speed i))) := by
  exact liveAndFrozenCar _ _ _ _ _ _ _ _ valid same
    (orderedContacts _ _ _ _ _ _ (initialPairsLive _ _ _ same nonnegative)) _

-- Distinct dummy values for inactive AIR progress cannot influence pair predicates.
theorem inactiveProgressIrrelevant (pc pa : Slot → Int) (live : Slot → Bool) (i j : Slot)
    (a : AirPairs) (agree : ∀ k, live k → pc k = pa k) :
    pairAir pc live i j a = pairAir pa live i j a := by
  cases li : live i <;> cases lj : live j <;> simp [pairAir,li,lj]
  rw [agree i li, agree j lj]

theorem pairProgressAlong (pairs : List (Slot×Slot)) (pc pa : Slot → Int) (live : Slot → Bool)
    (a : AirPairs) (agree : ∀ k, live k → pc k = pa k) :
    pairs.foldl (fun u ij => pairAir pc live ij.1 ij.2 u) a =
    pairs.foldl (fun u ij => pairAir pa live ij.1 ij.2 u) a := by
  induction pairs generalizing a with
  | nil => rfl
  | cons ij rest ih =>
    simp only [List.foldl_cons]
    rw [inactiveProgressIrrelevant pc pa live ij.1 ij.2 a agree, ih]

structure Snapshot (ι : Type) where
  track : Fin 3
  tick : Nat
  car : ι → Car
  dnf : ι → Option Nat

theorem fullPublicState {ι : Type} (a b : Snapshot ι)
    (ht : a.track = b.track) (hi : a.tick = b.tick)
    (words : ∀ i, pack (a.car i) = pack (b.car i)) (sidecar : ∀ i, a.dnf i = b.dnf i) :
    a = b := by
  have c : a.car = b.car := funext (fun i => completeRegisters _ _ (words i))
  have d : a.dnf = b.dnf := funext sidecar
  cases a; cases b; simp_all

theorem contactDivisionAndBound (x y : Int) (reach : mag (x-y)<1800) :
    (1800-mag (x-y)+1).tdiv 2 = (1801-mag (x-y))/2 ∧
    -900 ≤ nativeShift x y ∧ nativeShift x y ≤ 900 := by
  have nonneg : 0 ≤ mag (x-y) := by unfold mag; split <;> omega
  have numerator : 0 ≤ 1800-mag (x-y)+1 := by omega
  have trunc := @Int.tdiv_eq_ediv_of_nonneg (1800-mag (x-y)+1) 2 numerator
  by_cases left : x ≤ y <;> simp [nativeShift,left] <;> omega

theorem contactScratchBound (shifts : List Int) (x : Int) (old : -6520≤x ∧ x≤6520)
    (near : ∀ q ∈ shifts, -900≤q ∧ q≤900) (count : shifts.length≤7) :
    -12820 ≤ x + shifts.sum ∧ x + shifts.sum ≤ 12820 := by
  have bound (ds : List Int) (h : ∀ q ∈ ds, -900≤q ∧ q≤900) :
      -900*(ds.length:Int) ≤ ds.sum ∧ ds.sum ≤ 900*(ds.length:Int) := by
    induction ds with
    | nil => simp
    | cons d ds ih =>
      have hd := h d (by simp)
      have tail := ih (fun q hq => h q (by simp [hq]))
      simp; omega
  have h := bound shifts near
  omega

end StockRows
