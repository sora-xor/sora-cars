import StockRows
import StockMotion

namespace StockTick
open StockRows

structure Inputs where
  rain : Bool
  wind : Int
  -- These are selected from the old position of each car; all three track catalogs are pinned.
  coefficient : Slot → Int
  object : Slot → StockMotion.Object
  controls : Slot → StockMotion.Controls
  removed : Slot → Bool

abbrev State := Slot → Car
abbrev Words := Slot → Reg

def toMotion (a : Car) : StockMotion.Car := ⟨a.p,a.x,a.s,a.v,a.e⟩
def moved (a : StockMotion.Car) : Car := ⟨a.p,a.x,a.speed,a.velocity,a.energy,none⟩
def live (s : State) (u : Inputs) (i : Slot) := liveFlag (s i) (u.removed i)

def coreMove (s : State) (u : Inputs) (i : Slot) : Car :=
  if live s u i then moved (StockMotion.coreMove (toMotion (s i)) u.rain u.wind
      (u.coefficient i) (u.object i) (u.controls i)) else s i

def airMove (s : State) (u : Inputs) (i : Slot) : Car :=
  moved (StockMotion.airMove (toMotion (s i)) u.rain u.wind (u.coefficient i) (u.object i)
    (StockMotion.columns u.rain (u.controls i)))

theorem equalLiveMotion (s : State) (u : Inputs) (i : Slot) (h : live s u i) :
    coreMove s u i = airMove s u i := by simp [coreMove,airMove,h,StockMotion.activeCarMove]

theorem boundedMotion (a : StockMotion.Car) (rain : Bool) (wind k : Int)
    (o : StockMotion.Object) (c : StockMotion.Controls)
    (hp : -12000 ≤ a.p) (he : 0 ≤ a.energy ∧ a.energy ≤ 1000) :
    candidateBounds (moved (StockMotion.coreMove a rain wind k o c)) := by
  obtain ⟨mono,_,_,_,ls,us,lv,uv,le,ue⟩ :=
    StockMotion.activeBounds a rain wind k o c he.1 he.2
  exact ⟨Int.le_trans hp mono,ls,us,lv,uv,le,ue⟩

abbrev Pairs := List (Slot × Slot)
def coreContacts (s : State) (u : Inputs) (ps : Pairs) : CorePairs :=
  let m := coreMove s u
  ps.foldl (fun v ij => pairCore (fun i => (m i).p) (live s u) ij.1 ij.2 v)
    ⟨fun i => (m i).x,fun i => (m i).s⟩
def airContacts (s : State) (u : Inputs) (ps : Pairs) : AirPairs :=
  let m := airMove s u
  ps.foldl (fun v ij => pairAir (fun i => (m i).p) (live s u) ij.1 ij.2 v)
    ⟨fun i => (m i).x,fun _ => 0⟩
def coreTick (s : State) (u : Inputs) (ps : Pairs) (tick : Nat) (line : Int) (i : Slot) : Car :=
  let c := coreContacts s u ps
  coreEnd tick line (u.removed i) (s i) (withContact (coreMove s u i) (c.x i) (c.speed i))
def airTick (s : State) (u : Inputs) (ps : Pairs) (tick : Nat) (line : Int) (i : Slot) : Reg :=
  let a := airContacts s u ps
  let m := airMove s u i
  airEnd true (u.removed i) tick line (pack (s i))
    (withContact m (a.x i) (max 0 (m.s-120*(a.count i))))

theorem coreMovedBounds (s : State) (u : Inputs) (tick : Nat) (line : Int)
    (good : ∀ i, invariant line tick (s i)) (i : Slot) : candidateBounds (coreMove s u i) := by
  obtain ⟨p,_,_,_,lo,hi,lv,hv,le,he,_⟩ := good i
  unfold coreMove
  split
  · exact boundedMotion _ _ _ _ _ _ p ⟨le,he⟩
  · exact ⟨p,lo,hi,lv,hv,le,he⟩

theorem contactsRelated (s : State) (u : Inputs) (ps : Pairs) (tick : Nat) (line : Int)
    (good : ∀ i, invariant line tick (s i)) :
    related (live s u) (fun i => (airMove s u i).s) (coreContacts s u ps) (airContacts s u ps) := by
  have inputs := initialPairsLive (live s u) (coreMove s u) (airMove s u)
    (equalLiveMotion s u) (fun i _ => (coreMovedBounds s u tick line good i).2.1)
  have joint := orderedContacts ps (fun i => (coreMove s u i).p) _ _ _ _ inputs
  have heq := pairProgressAlong ps (fun i => (coreMove s u i).p)
    (fun i => (airMove s u i).p) (live s u)
    (⟨fun i => (airMove s u i).x,fun _ => 0⟩ : AirPairs)
    (fun i li => congrArg Car.p (equalLiveMotion s u i li))
  unfold coreContacts airContacts; rw [← heq]
  exact joint

theorem fullTickMatches (s : State) (u : Inputs) (ps : Pairs) (tick : Nat) (line : Int)
    (good : ∀ i, invariant line tick (s i)) (i : Slot) :
    airTick s u ps tick line i = pack (coreTick s u ps tick line i) :=
  liveAndFrozenCar s (coreMove s u) (airMove s u) u.removed _ _ tick line good
    (equalLiveMotion s u) (contactsRelated s u ps tick line good) i

theorem fullTickBound (s : State) (u : Inputs) (ps : Pairs) (tick : Nat) (line : Int)
    (hl : 0 ≤ line) (good : ∀ i, invariant line tick (s i)) (i : Slot) :
    invariant line (tick+1) (coreTick s u ps tick line i) := by
  have cm := coreMovedBounds s u tick line good i
  by_cases alive : live s u i = true
  · have hit := (contactsRelated s u ps tick line good) i alive
    have same := equalLiveMotion s u i alive
    dsimp only at hit
    rw [← same] at hit
    apply endPreserves _ _ _ _ _ hl (good i)
    obtain ⟨hp,ls,us,lv,uv,le,ue⟩ := cm
    change -12000 ≤ (coreMove s u i).p ∧ 0≤(coreContacts s u ps).speed i ∧
      (coreContacts s u ps).speed i ≤ 3000 ∧ _
    exact ⟨hp, by rw [hit.2]; omega, by rw [hit.2]; omega, lv,uv,le,ue⟩
  · have dead : ((s i).finish.isSome || u.removed i) = true := by
      cases hf : (s i).finish <;> cases hd : u.removed i <;> simp_all [live,liveFlag]
    have ⟨hp,up,lx,ux,ls,us,lv,uv,le,ue,stamp⟩ := good i
    simp only [coreTick,coreEnd,dead,if_true,railIdentity _ lx ux]
    exact ⟨hp,up,lx,ux,ls,us,lv,uv,le,ue,fun t ht =>
      ⟨(stamp t ht).1,Nat.le_trans (stamp t ht).2.1 (Nat.le_succ _),(stamp t ht).2.2⟩⟩

def program (inputs : Nat → State → Inputs) (pairs : Pairs) (line : Int) (i : Nat) (s : State) : State :=
  coreTick s (inputs i s) pairs i line
def runState (inputs : Nat → State → Inputs) (pairs : Pairs) (line : Int) :=
  run (program inputs pairs line) grid

theorem reachableValid (inputs : Nat → State → Inputs) (pairs : Pairs) (line : Int) (hl : 0 ≤ line) :
    ∀ i k, invariant line i (runState inputs pairs line i k) := by
  intro i
  induction i with
  | zero => exact fun k => gridValid k line hl
  | succ i ih => exact fullTickBound _ _ _ _ _ hl ih

def packed (s : State) : Words := fun i => pack (s i)

-- F may be the native field-row representation. Bounded deltas and lookup semantics are needed
-- only to realize this integer AIR program from its polynomial constraints at the current row.
theorem wholeTrace {F : Type} (represent : Words → F) (raw : Nat → F)
    (inputs : Nat → State → Inputs) (pairs : Pairs) (line : Int) (hl : 0≤line) (steps rows : Nat)
    (origin : raw 0 = represent (packed grid))
    (realizes : ∀ i, i<steps → i+1<rows →
      let s := runState inputs pairs line i
      raw i = represent (packed s) →
      raw (i+1) = represent (airTick s (inputs i s) pairs i line))
    (padded : ∀ i, steps≤i → i+1<rows → raw (i+1) = raw i) :
    ∀ r, r<rows → raw r = represent (packed (runState inputs pairs line (min r steps))) := by
  apply embeddedExecution (fun s => represent (packed s)) (program inputs pairs line) grid rows steps raw origin
  · intro i act inside previous
    have eq := realizes i act inside previous
    have one : airTick (runState inputs pairs line i) (inputs i (runState inputs pairs line i)) pairs i line =
        packed (runState inputs pairs line (i+1)) :=
      funext (fullTickMatches _ _ _ _ _ (reachableValid inputs pairs line hl i))
    rw [one] at eq
    exact eq
  · exact padded

end StockTick
