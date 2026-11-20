import Std

namespace StockWinners

abbrev Tick := Fin (2^32)
abbrev Progress := Fin (2^64)
abbrev Slot := Fin 8

structure Row where
  slot : Slot
  finish : Option Tick
  dnf : Option Tick
  progress : Progress
deriving DecidableEq, Repr

-- Biasing signed i64 progress into Fin (2^64) preserves its entire order.
def mm (p : Progress) : Int := p.val - 9223372036854775808

theorem progressOrder (p q : Progress) : mm p ≤ mm q ↔ p.val ≤ q.val := by
  unfold mm; omega

-- A smaller key is better. All finish times precede every unfinished car.
def perf (r : Row) : Nat :=
  match r.finish with
  | some t => t.val
  | none => 4294967296 + (18446744073709551615 - r.progress.val)

def rank (r : Row) : Nat :=
  8 * ((if r.dnf.isSome then 18446744078004518912 else 0) + perf r) + r.slot.val

-- The two frozen comparators agree on these tests. Slot is the final display tiebreak.
def nativeLe (a b : Row) : Prop :=
  if a.dnf.isSome != b.dnf.isSome then a.dnf.isNone else
  match a.finish, b.finish with
  | some t, some u => if t = u then a.slot.val ≤ b.slot.val else t.val < u.val
  | some _, none => True
  | none, some _ => False
  | none, none =>
    if a.progress = b.progress then a.slot.val ≤ b.slot.val else b.progress.val < a.progress.val

theorem rankMatches (a b : Row) : rank a ≤ rank b ↔ nativeLe a b := by
  obtain ⟨⟨sa, hsa⟩, fa, da, ⟨pa, hpa⟩⟩ := a
  obtain ⟨⟨sb, hsb⟩, fb, db, ⟨pb, hpb⟩⟩ := b
  cases fa <;> cases fb <;> cases da <;> cases db <;>
    simp [rank, perf, nativeLe, Fin.ext_iff] at * <;>
    (try split) <;> (try rename_i t) <;>
    first | omega | (rename_i u; have := t.isLt; have := u.isLt; simp at *; omega) |
       (have := t.isLt; simp at *; omega)

theorem performanceBounds (r : Row) : perf r < 18446744078004518912 := by
  cases h : r.finish with
  | none => simp [perf,h]; omega
  | some t => have := t.isLt; simp [perf,h]; omega

theorem rankOrdersEligibility (a b : Row) (h : rank a ≤ rank b)
    (hb : b.dnf.isNone) : a.dnf.isNone := by
  have ha0 := performanceBounds a
  have hb0 := performanceBounds b
  have ha1 := a.slot.isLt; have hb1 := b.slot.isLt
  cases ha : a.dnf <;> cases hb' : b.dnf <;> simp_all [rank] <;> omega

theorem rankOrdersPerformance (a b : Row) (h : rank a ≤ rank b)
    (ha : a.dnf.isNone) (hb : b.dnf.isNone) : perf a ≤ perf b := by
  have ha1 := a.slot.isLt; have hb1 := b.slot.isLt
  cases da : a.dnf <;> cases db : b.dnf <;> simp_all [rank] <;> omega

def sorted (xs : List Row) := xs.mergeSort (fun a b => decide (rank a ≤ rank b))
def eligible (xs : List Row) := (sorted xs).filter (fun a => a.dnf.isNone)

theorem sortedRanks (xs : List Row) : (sorted xs).Pairwise (fun a b => rank a ≤ rank b) := by
  have h := List.pairwise_mergeSort (le := fun a b => decide (rank a ≤ rank b))
    (by intro a b c; simp; omega) (by intro a b; simp; omega) xs
  simpa [sorted] using h

theorem eligibleMem (xs : List Row) (a : Row) :
    a ∈ eligible xs ↔ a ∈ xs ∧ a.dnf.isNone := by simp [eligible, sorted]

-- Physical standings use take_while and economic standings use filter.
theorem takeWhileIsFilter (xs : List Row) (hs : xs.Pairwise (fun a b => rank a ≤ rank b)) :
    xs.takeWhile (fun r => r.dnf.isNone) = xs.filter (fun r => r.dnf.isNone) := by
  induction xs with
  | nil => rfl
  | cons a as ih =>
    obtain ⟨first,tail⟩ := List.pairwise_cons.mp hs
    cases ha : a.dnf.isNone with
    | true => simp [ha, ih tail]
    | false =>
      have empty : as.filter (fun r => r.dnf.isNone) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro b hb
        cases H : b.dnf.isNone with
        | false => decide
        | true => have := rankOrdersEligibility a b (first b hb) H; simp_all
      simp [ha, empty]

theorem eligibleOrdered (xs : List Row) : (eligible xs).Pairwise (fun a b => perf a ≤ perf b) := by
  apply List.pairwise_filter.mpr
  exact (sortedRanks xs).imp (fun {a b} h ha hb => rankOrdersPerformance a b h ha hb)

-- Rust's finish, sole-survivor, cap and refund branches; none denotes rejection.
def selectRows (cap : Bool) : List Row → Option (List Row)
  | [] => some []
  | a :: as =>
    match a.finish with
    | some t => some ((a :: as).filter (fun b => b.finish == some t))
    | none => if as.isEmpty then some [a] else
              if cap then some ((a :: as).filter (fun b => b.progress == a.progress))
              else none

def best (xs : List Row) (a : Row) := a ∈ xs ∧ ∀ b ∈ xs, perf a ≤ perf b

theorem finishEqual (b : Row) (t : Tick) : perf b = t.val ↔ b.finish = some t := by
  have ht := t.isLt
  cases hb : b.finish with
  | none => simp [perf, hb]; omega
  | some u => simp [perf, hb, Fin.ext_iff]

theorem noFinishAfter (a b : Row) (ha : a.finish = none) (h : perf a ≤ perf b) : b.finish = none := by
  cases hb : b.finish with
  | none => rfl
  | some t => have ht := t.isLt; simp [perf, ha, hb] at h; omega

theorem sameRunning (a b : Row) (ha : a.finish = none) (hb : b.finish = none) :
    perf a = perf b ↔ a.progress = b.progress := by
  have h1 := a.progress.isLt; have h2 := b.progress.isLt
  simp [perf, ha, hb, Fin.ext_iff]; omega

theorem firstBest {a : Row} {as : List Row}
    (hs : (a::as).Pairwise (fun u v => perf u ≤ perf v)) :
    ∀ b ∈ a::as, perf a ≤ perf b := by
  intro b hb
  rcases List.mem_cons.mp hb with eq | h
  · subst b; omega
  · exact (List.pairwise_cons.mp hs).1 b h

theorem isBestIffFirst {a b : Row} {as : List Row}
    (hs : (a::as).Pairwise (fun u v => perf u ≤ perf v)) :
    best (a::as) b ↔ b ∈ a::as ∧ perf b = perf a := by
  constructor
  · rintro ⟨hb, wall⟩
    have low := firstBest hs b hb
    have high := wall a (by simp)
    exact ⟨hb, by omega⟩
  · rintro ⟨hb, eq⟩
    exact ⟨hb, fun c hc => eq ▸ firstBest hs c hc⟩

theorem selectionExact (xs : List Row) (cap : Bool) (wins : List Row)
    (hs : xs.Pairwise (fun u v => perf u ≤ perf v))
    (ok : selectRows cap xs = some wins) (b : Row) :
    b ∈ wins ↔ best xs b := by
  cases xs with
  | nil => simp [selectRows] at ok; subst wins; simp [best]
  | cons a as =>
    rw [isBestIffFirst hs]
    cases ha : a.finish with
    | some t =>
      simp only [selectRows, ha, Option.some.injEq] at ok; subst wins
      simp only [List.mem_filter, beq_iff_eq]
      rw [show perf a = t.val by simp [perf, ha], finishEqual]
    | none =>
      cases as with
      | nil => simp [selectRows, ha] at ok; subst wins; simp; grind
      | cons c cs =>
        cases cap with
        | false => simp [selectRows, ha] at ok
        | true =>
          simp only [selectRows, ha, List.isEmpty, Bool.false_eq_true, if_false, if_true, Option.some.injEq] at ok; subst wins
          simp only [List.mem_filter, beq_iff_eq]
          by_cases hb : b ∈ a::c::cs
          · have hbn := noFinishAfter a b ha (firstBest hs b hb)
            simp [hb, sameRunning b a hbn ha]
          · simp [hb]

theorem rejectionExact (xs : List Row) (cap : Bool)
    (hs : xs.Pairwise (fun a b => perf a ≤ perf b)) :
    selectRows cap xs = none ↔ cap = false ∧ 2 ≤ xs.length ∧ ∀ b ∈ xs, b.finish = none := by
  cases xs with
  | nil => simp [selectRows]
  | cons a as =>
    cases ha : a.finish with
    | some t => simp [selectRows, ha]
    | none =>
      have h : ∀ b ∈ a::as, b.finish = none :=
        fun b hb => noFinishAfter a b ha (firstBest hs b hb)
      cases as with
      | nil => simp [selectRows, ha]
      | cons c cs =>
        cases cap with
        | false =>
          constructor
          · intro _; exact ⟨rfl, by simp, h⟩
          · intro _; simp [selectRows, ha]
        | true => simp [selectRows, ha]

theorem selectionSublist (xs wins : List Row) (cap : Bool) (h : selectRows cap xs = some wins) :
    wins.Sublist xs := by
  cases xs with
  | nil => simp [selectRows] at h; subst wins; simp
  | cons a as =>
    cases ha : a.finish with
    | some t =>
      simp only [selectRows, ha, Option.some.injEq] at h; subst wins
      exact List.filter_sublist
    | none =>
      cases as with
      | nil => simp [selectRows, ha] at h; subst wins; simp
      | cons c cs =>
        cases cap with
        | false => simp [selectRows, ha] at h
        | true =>
          simp only [selectRows, ha, List.isEmpty, Bool.false_eq_true, if_false, if_true, Option.some.injEq] at h
          subst wins; exact List.filter_sublist

def slotNumber (r : Row) := r.slot.val
def winnerSlots (wins : List Row) := (wins.map slotNumber).mergeSort

theorem winningSlotIff (roster wins : List Row) (cap : Bool)
    (ok : selectRows cap (eligible roster) = some wins) (s : Nat) :
    s ∈ winnerSlots wins ↔ ∃ r ∈ roster, r.slot.val = s ∧ r.dnf.isNone ∧
        ∀ c ∈ roster, c.dnf.isNone → perf r ≤ perf c := by
  simp only [winnerSlots, List.mem_mergeSort, List.mem_map]
  constructor
  · rintro ⟨r,hr,same⟩
    obtain ⟨member,all⟩ := (selectionExact _ _ _ (eligibleOrdered _) ok r).mp hr
    obtain ⟨orig,active⟩ := (eligibleMem _ _).mp member
    exact ⟨r,orig,same,active,fun c hc he => all c ((eligibleMem _ _).mpr ⟨hc,he⟩)⟩
  · rintro ⟨r,orig,same,active,all⟩
    refine ⟨r,(selectionExact _ _ _ (eligibleOrdered _) ok r).mpr ⟨?_,?_⟩,same⟩
    · exact (eligibleMem _ _).mpr ⟨orig,active⟩
    · intro c hc
      obtain ⟨mem,act⟩ := (eligibleMem _ _).mp hc
      exact all c mem act

theorem winnerSlotsStrict (roster wins : List Row) (cap : Bool)
    (unique : (roster.map slotNumber).Nodup) (ok : selectRows cap (eligible roster) = some wins) :
    (winnerSlots wins).Pairwise (· < ·) := by
  have perm := (List.mergeSort_perm roster (fun a b => decide (rank a ≤ rank b))).map slotNumber
  have du : ((sorted roster).map slotNumber).Nodup := perm.nodup_iff.mpr unique
  have sub : wins.Sublist (sorted roster) :=
    (selectionSublist _ _ _ ok).trans List.filter_sublist
  have du' : (winnerSlots wins).Nodup := (List.mergeSort_perm _ _).nodup_iff.mpr
    (List.Nodup.sublist (sub.map slotNumber) du)
  have ord := List.pairwise_mergeSort (le := fun a b : Nat => decide (a ≤ b))
    (by intro a b c; simp; omega) (by intro a b; simp; omega) (wins.map slotNumber)
  have le : (winnerSlots wins).Pairwise (· ≤ ·) := by simpa [winnerSlots] using ord
  change (winnerSlots wins).Pairwise (· ≠ ·) at du'
  exact (le.and du').imp (by intro a b p; omega)

-- Physical branch uses a marked terminal boundary for unfinished racers (n≥2 and tick%6=0).
def physicalBoundaryRows (cap : Bool) : List Row → List Row
  | [] => []
  | a::as => match a.finish with
    | some t => (a::as).filter (fun b => b.finish == some t)
    | none => if as.isEmpty then [a] else if cap then (a::as).filter (fun b => b.progress == a.progress) else []

theorem physicalAgreement (xs : List Row) (cap : Bool) :
    physicalBoundaryRows cap xs = (selectRows cap xs).getD [] := by
  cases xs with
  | nil => rfl
  | cons a as => cases ha : a.finish <;> cases as <;> cases cap <;> simp [physicalBoundaryRows, selectRows, ha]

-- Native unique validated DNF event per slot, lifted to the accepted frontier.
def atTick (bound : Nat) (r : Option Tick) : Option Tick := r.filter (fun t => decide (t.val ≤ bound))
def update (removal : Slot → Option Tick) (r : Row) : Row := {r with dnf := removal r.slot}

theorem updatePreserves (removal : Slot → Option Tick) (r : Row) :
    (update removal r).slot = r.slot ∧ (update removal r).finish = r.finish ∧
    (update removal r).progress = r.progress ∧ perf (update removal r) = perf r := by
  exact ⟨rfl,rfl,rfl,rfl⟩

theorem removalPersists (earlier later : Nat) (t : Tick) (r : Option Tick)
    (he : earlier ≤ later) (h : atTick earlier r = some t) : atTick later r = some t := by
  cases r with
  | none => simp [atTick] at h
  | some u =>
    simp [atTick] at h ⊢
    exact ⟨h.1, Nat.le_trans h.2 he⟩

theorem economicWinnerIff (physical wins : List Row) (removal : Slot → Option Tick) (cap : Bool)
    (ok : selectRows cap (eligible (physical.map (update removal))) = some wins) (s : Nat) :
    s ∈ winnerSlots wins ↔ ∃ r ∈ physical, r.slot.val = s ∧ (removal r.slot).isNone ∧
        ∀ c ∈ physical, (removal c.slot).isNone → perf r ≤ perf c := by
  rw [winningSlotIff _ _ _ ok s]
  constructor
  · rintro ⟨a, hm, slot, active, hbest⟩
    obtain ⟨r, hr, rfl⟩ := List.mem_map.mp hm
    exact ⟨r, hr, slot, active, fun c hc hactive => hbest (update removal c) (List.mem_map.mpr ⟨c,hc,rfl⟩) hactive⟩
  · rintro ⟨r, hr, slot, active, hbest⟩
    refine ⟨update removal r, List.mem_map.mpr ⟨r,hr,rfl⟩, slot, active, ?_⟩
    intro a ha hactive
    obtain ⟨c, hc, rfl⟩ := List.mem_map.mp ha
    exact hbest c hc hactive

-- Flattening each jointly validated event's ordered slots yields (slot, tick) writes.
abbrev Event := Slot × Tick
def install (table : Slot → Option Tick) (e : Event) (s : Slot) : Option Tick :=
  if e.1 = s then some e.2 else table s

def applyEvents (table : Slot → Option Tick) : List Event → Slot → Option Tick
  | [] => table
  | e::rest => applyEvents (install table e) rest

theorem exactEventWrites (events : List Event) (table : Slot → Option Tick)
    (unique : (events.map Prod.fst).Nodup)
    (fresh : ∀ e ∈ events, table e.1 = none) (s : Slot) (t : Tick) :
    applyEvents table events s = some t ↔ table s = some t ∨ (s,t) ∈ events := by
  induction events generalizing table with
  | nil => simp [applyEvents]
  | cons e es ih =>
    obtain ⟨distinct,tailUnique⟩ := List.nodup_cons.mp (show (e.1::es.map Prod.fst).Nodup from unique)
    have tailFresh : ∀ f ∈ es, install table e f.1 = none := by
      intro f hf
      have same : e.1 ≠ f.1 := by
        intro h
        exact distinct (List.mem_map.mpr ⟨f,hf,h.symm⟩)
      simp [install,same,fresh f (List.mem_cons_of_mem _ hf)]
    rw [applyEvents, ih _ tailUnique tailFresh]
    obtain ⟨k,v⟩ := e
    by_cases same : k = s
    · subst k
      have empty := fresh (s,v) (by simp)
      simp [install,empty,eq_comm]
    · simp [install,same,Ne.symm same]

theorem completeRemovalTable (events : List Event) (unique : (events.map Prod.fst).Nodup)
    (s : Slot) (t : Tick) :
    applyEvents (fun _ => none) events s = some t ↔ (s,t) ∈ events := by
  simpa using exactEventWrites events (fun _ => none) unique (by simp) s t

theorem representsSignedProgress (z : Int)
    (lo : -9223372036854775808 ≤ z) (hi : z ≤ 9223372036854775807) :
    ∃ p : Progress, mm p = z := by
  refine ⟨⟨(z + 9223372036854775808).toNat, by omega⟩,?_⟩
  unfold mm; simp; omega

theorem fasterFinish (a b : Row) (t u : Tick) (ha : a.finish = some t) (hb : b.finish = some u) :
    perf a ≤ perf b ↔ t.val ≤ u.val := by simp [perf, ha, hb]

theorem finishedBeatsUnfinished (a b : Row) (t : Tick) (ha : a.finish = some t)
    (hb : b.finish = none) : perf a < perf b := by
  have ht := t.isLt
  simp [perf, ha, hb]; omega

theorem furtherProgress (a b : Row) (ha : a.finish = none) (hb : b.finish = none) :
    perf a ≤ perf b ↔ mm b.progress ≤ mm a.progress := by
  have ha0 := a.progress.isLt; have hb0 := b.progress.isLt
  simp [perf,ha,hb,mm]; omega

theorem emptyExactlyNoEligible (roster wins : List Row) (cap : Bool)
    (ok : selectRows cap (eligible roster) = some wins) :
    wins = [] ↔ ∀ r ∈ roster, r.dnf.isNone = false := by
  cases he : eligible roster with
  | nil =>
    have eq : wins = [] := by simpa [he, selectRows] using ok.symm
    simp only [eq,true_iff]
    intro b hb
    cases h : b.dnf.isNone with
    | false => rfl
    | true =>
      have hm := (eligibleMem roster b).mpr ⟨hb,h⟩
      simp [he] at hm
  | cons b bs =>
    have hb : b ∈ eligible roster := by simp [he]
    obtain ⟨hr,active⟩ := (eligibleMem _ _).mp hb
    have bw : b ∈ wins := (selectionExact _ _ _ (eligibleOrdered _) ok b).mpr
      ⟨hb, fun c hc => (firstBest (he ▸ eligibleOrdered roster)) c (he ▸ hc)⟩
    constructor
    · intro empty; simp [empty] at bw
    · intro all
      have ne := all b hr
      simp_all

end StockWinners
