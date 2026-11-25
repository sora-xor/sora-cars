import Std

namespace StockGadgets

def P : Int := 18446744069414584321
def Cong (x y : Int) : Prop := (x - y) % P = 0

theorem liftCong {x y : Int} (low : -P < x-y) (high : x-y < P) (h : Cong x y) : x=y := by
  unfold Cong P at *; omega

theorem fieldBit {F : Type} (z o : F) (mul sub : F → F → F)
    (prime : ∀ x y, mul x y = z → x=z ∨ y=z)
    (cancel : ∀ x, sub x o = z → x=o)
    (b : F) (h : mul b (sub b o) = z) : b=z ∨ b=o := by
  rcases prime b (sub b o) h with h | h
  · exact Or.inl h
  · exact Or.inr (cancel b h)

-- Lift of a radix-65536 reconstruction. Each digit is admitted by the lookup.
def digits : List Int → Int
  | [] => 0
  | x::xs => x + 65536 * digits xs

theorem radixBounds (xs : List Int) (hd : ∀ x ∈ xs, 0 ≤ x ∧ x < 65536) :
    0 ≤ digits xs ∧ digits xs < (65536:Int) ^ xs.length := by
  induction xs with
  | nil => decide
  | cons x xs ih =>
    have hx := hd x (by simp)
    have hy := ih (fun y hm => hd y (by simp [hm]))
    simp only [digits, List.length_cons, Int.pow_succ']
    omega

-- Each half of bounded_forced uses padded limbs. Either half may exceed bound
-- on its own. Congruence of their sum to bound, and the no-wrap budget, pins it.
theorem forcedBound (lo hi bound : Int) (hl : 0 ≤ lo) (hh : 0 ≤ hi)
    (hlcap : lo < 2^62) (hhcap : hi < 2^62) (hb : 0 ≤ bound ∧ bound < 2^62)
    (sum : Cong (lo+hi) bound) : 0 ≤ lo ∧ lo ≤ bound := by
  have he := liftCong (x:=lo+hi) (y:=bound) (by unfold P; omega) (by unfold P; omega) sum
  omega

-- A legitimate bounded integer with a limb representation is its integer lift.
theorem liftRange (x r : Int) (hx : -(2^61) ≤ x ∧ x ≤ 2^61)
    (hr : 0 ≤ r ∧ r < 2^62) (h : Cong x r) : x = r := by
  apply liftCong _ _ h <;> unfold P <;> omega

-- Strict comparison, including equality, from the actual modular offset identity.
theorem comparison (d shift b u : Int) (hs : 0 < shift ∧ shift ≤ 2^60)
    (hd : -shift < d ∧ d < shift) (hb : b=0 ∨ b=1)
    (hu : 0 ≤ u ∧ u < shift) (h : Cong (d+shift*b) u) : b = (if d<0 then 1 else 0) := by
  rcases hb with rfl | rfl <;> simp at h
  · have hx := liftCong (x:=d) (y:=u) (by unfold P; omega) (by unfold P; omega) h
    split <;> omega
  · have hx := liftCong (x:=d+shift) (y:=u) (by unfold P; omega) (by unfold P; omega) h
    split <;> omega

theorem selectBranch (b a c : Int) (hb : b=0 ∨ b=1) :
    c + b*(a-c) = (if b=1 then a else c) := by
  rcases hb with rfl | rfl <;> simp <;> omega

def count : List (Int × Bool) → Nat
  | [] => 0
  | (_,b)::xs => (if b then 1 else 0) + count xs

def weighted : List (Int × Bool) → Int
  | [] => 0
  | (w,b)::xs => (if b then w else 0) + weighted xs

theorem zeroWeight (xs : List (Int × Bool)) (h : count xs = 0) : weighted xs = 0 := by
  induction xs with
  | nil => rfl
  | cons x xs ih =>
    rcases x with ⟨w,b⟩; cases b <;> simp [count,weighted] at *
    exact ih h

theorem singleWeight (xs : List (Int × Bool)) (h : count xs = 1) :
    ∃ w, (w,true) ∈ xs ∧ weighted xs = w := by
  induction xs with
  | nil => simp [count] at h
  | cons x xs ih =>
    rcases x with ⟨w,b⟩; cases b
    · simp [count] at h
      obtain ⟨v, hm, hv⟩ := ih h
      exact ⟨v, by simp [hm], by simpa [weighted] using hv⟩
    · have hz : count xs = 0 := by simp [count] at h; omega
      exact ⟨w, by simp, by simp [weighted,zeroWeight xs hz]⟩

theorem floorUnique {a q d : Int} (hd : 0 < d) (rem : 0 ≤ a-q*d ∧ a-q*d<d) : a/d=q := by
  calc
    a/d = ((a-q*d)+q*d)/d := by congr 1; omega
    _ = (a-q*d)/d+q := Int.add_mul_ediv_right _ _ (by omega)
    _ = q := by rw [Int.ediv_eq_zero_of_lt rem.1 rem.2]; omega

theorem truncPositive {a q d : Int} (hd : 0<d) (ha : 0≤a)
    (rem : 0≤a-q*d ∧ a-q*d<d) : a.tdiv d=q := by
  rw [Int.tdiv_eq_ediv_of_nonneg ha]; exact floorUnique hd rem

theorem truncNegative {a q d : Int} (hd : 0<d) (ha : a≤0)
    (rem : 0≤ -(a-q*d) ∧ -(a-q*d)<d) : a.tdiv d=q := by
  have neg := truncPositive (a:=-a) (q:=-q) hd (by omega) (by rw [Int.neg_mul]; omega)
  rw [Int.neg_tdiv] at neg; omega

theorem truncate {a q d : Int} (hd : 0<d)
    (hsign : (0≤a ∧ 0≤a-q*d ∧ a-q*d<d) ∨ (a≤0 ∧ 0≤ -(a-q*d) ∧ -(a-q*d)<d)) : a.tdiv d=q := by
  rcases hsign with h | h
  · exact truncPositive hd h.1 h.2
  · exact truncNegative hd h.1 h.2

-- Concrete tracks make this an integer theorem; both one-hot indexes are in their signed lists.
theorem wrapped (p lap c L : Int) (track : L=2000000 ∨ L=2400000 ∨ L=1800000)
    (cell : 0≤c ∧ c≤11) (r : 0≤12*(p-lap*L)-L*c ∧ 12*(p-lap*L)-L*c<L) :
    0≤p-lap*L ∧ p-lap*L<L ∧ p/L=lap ∧ (12*(p-lap*L))/L=c := by
  rcases track with rfl|rfl|rfl <;> omega

theorem verge (x : Int) : ((if 6000<x then 1 else 0) + (if x < -6000 then 1 else 0) : Int) ∈ [0,1] := by
  split <;> split <;> simp_all <;> omega

theorem distance (s : Int) : (if s<1 then -s else s) = (if s<0 then -s else s) ∧
    0 ≤ (if s<1 then -s else s) := by
  split <;> split <;> omega

theorem capProgress (p v finish : Int) (hp : -12000≤p ∧ p≤finish) (hv : 0≤v ∧ v≤3000) :
    -12000 ≤ (if p+v < finish then p+v else finish) ∧ (if p+v < finish then p+v else finish) ≤ finish := by
  split <;> omega
theorem witnessedRange (x bound low high : Int) (hl : 0≤low ∧ low<2^62) (hh : 0≤high ∧ high<2^62)
    (xbound : -(2^61)≤x ∧ x≤2^61) (ubound : -(2^61)≤bound-x ∧ bound-x≤2^61)
    (cl : Cong x low) (ch : Cong (bound-x) high) : 0≤x ∧ x≤bound := by
  have l := liftRange x low xbound hl cl
  have h := liftRange (bound-x) high ubound hh ch
  omega

theorem truncFromField (a q d sign m : Int) (hd : 0<d) (hm : 0≤m ∧ m<d ∧ m<2^62)
    (aBound : -(2^60)≤a ∧ a≤2^60) (qBound : -(2^60)<q*d ∧ q*d<2^60)
    (bitSign : (sign=0 ∧ 0≤a) ∨ (sign=1 ∧ a≤0))
    (fieldEq : Cong ((a-q*d)*(1-2*sign)) m) : a.tdiv d=q := by
  rcases bitSign with ⟨rfl, ha⟩ | ⟨rfl, ha⟩
  · simp at fieldEq
    have eq := liftRange (a-q*d) m (by omega) (by omega) fieldEq
    exact truncPositive hd ha (by omega)
  · have signed : Cong (-(a-q*d)) m := by simpa using fieldEq
    have eq := liftRange (-(a-q*d)) m (by omega) (by omega) signed
    exact truncNegative hd ha (by omega)

theorem countBound (xs : List (Int × Bool)) : count xs ≤ xs.length := by
  induction xs with
  | nil => decide
  | cons x xs ih => rcases x with ⟨w,b⟩; cases b <;> simp [count] <;> omega

theorem oneHotFromField (xs : List (Int × Bool)) (length : xs.length≤12)
    (one : Cong (count xs : Int) 1) : ∃ w, (w,true) ∈ xs ∧ weighted xs = w := by
  have hc := countBound xs
  have exactOne := liftCong (x:=(count xs : Int)) (y:=1) (by unfold P; omega) (by unfold P; omega) one
  exact singleWeight xs (by omega)
theorem quotientRepresentative (q qmin r : Int) (h : Cong (q-qmin) r) : Cong q (qmin+r) := by
  unfold Cong at *
  rw [show q-(qmin+r)=q-qmin-r by omega]
  exact h

theorem selectFromField (b a c output : Int) (hb : b=0 ∨ b=1)
    (identity : Cong output (c+b*(a-c))) : Cong output (if b=1 then a else c) := by
  rw [selectBranch b a c hb] at identity
  exact identity

theorem windSign (wind speed : Int) (nonneg : 0 ≤ speed) :
    let b : Int := if wind < 0 then 1 else 0
    (b=0 ∧ 0≤wind*speed) ∨ (b=1 ∧ wind*speed≤0) := by
  dsimp; split
  · right; exact ⟨rfl, Int.mul_nonpos_of_nonpos_of_nonneg (by omega) nonneg⟩
  · left; exact ⟨rfl, Int.mul_nonneg (by omega) nonneg⟩

theorem contactHalf (overlap : Int) (h : 0≤overlap ∧ overlap≤1801) :
    0≤overlap/2 ∧ overlap/2≤900 := by omega
theorem clampInteger (x lo hi : Int) (ordered : lo ≤ hi) :
    let below : Int := if x<lo then 1 else 0
    let above : Int := if hi<x then 1 else 0
    let result := below*lo + above*hi + (1-below-above)*x
    lo ≤ result ∧ result ≤ hi ∧ result = (if x<lo then lo else if hi<x then hi else x) := by
  dsimp; split <;> split <;> simp_all <;> omega

theorem retainedProgress (p v finish : Int) (active live : Bool) (hp : -12000≤p ∧ p≤finish)
    (hv : 0≤v ∧ v≤3000) :
    let newP := if active then (if live then (if p+v<finish then p+v else finish) else p) else p
    (-12000:Int) ≤ newP ∧ newP≤finish := by
  cases active <;> cases live <;> simp <;> first | exact hp | exact capProgress p v finish hp hv
end StockGadgets
