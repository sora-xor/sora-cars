import Std

/- Stock's successful decimal operations expressed in units of its frozen payout
   quantum. The native source at 371f95f6 checks representability before custody.
   This proof assumes exact checked decimal arithmetic at the selected scale. -/
namespace StockPayout

/-- Subtract the same amount once per recipient, stopping on insufficient funds. -/
def subtractShares (share : Nat) : Nat → Nat → Option Nat
  | 0, pool => some pool
  | count + 1, pool =>
    if share ≤ pool then subtractShares share count (pool - share) else none

theorem subtractShares_exact (share count pool left : Nat) :
    subtractShares share count pool = some left ↔ pool = count * share + left := by
  induction count generalizing pool with
  | zero => simp [subtractShares]
  | succ count ih =>
    by_cases enough : share ≤ pool
    · simp only [subtractShares, if_pos enough, ih, Nat.succ_mul]
      omega
    · have impossible : pool ≠ count * share + share + left := by omega
      simp [subtractShares, enough, Nat.succ_mul, impossible]

/-- The second loop processes the canonically ordered slots from left to right. -/
def distribute (share : Nat) : Nat → Nat → List Nat
  | 0, _ => []
  | count + 1, 0 => share :: distribute share count 0
  | count + 1, extra + 1 => (share + 1) :: distribute share count extra

theorem distribute_in_order (share count extra : Nat) (fits : extra ≤ count) :
    distribute share count extra =
      List.replicate extra (share + 1) ++ List.replicate (count - extra) share := by
  induction count generalizing extra with
  | zero =>
    have h : extra = 0 := by omega
    simp [h, distribute]
  | succ count ih =>
    cases extra with
    | zero => simp [distribute, ih 0 (Nat.zero_le count), List.replicate_succ]
    | succ extra =>
      have h : extra ≤ count := by omega
      simp [distribute, ih extra h, List.replicate_succ]

theorem distribute_sum (share count extra : Nat) (fits : extra ≤ count) :
    (distribute share count extra).sum = count * share + extra := by
  induction count generalizing extra with
  | zero =>
    have h : extra = 0 := by omega
    simp [h, distribute]
  | succ count ih =>
    cases extra with
    | zero =>
      simp only [distribute, List.sum_cons, ih 0 (Nat.zero_le count), Nat.succ_mul]
      omega
    | succ extra =>
      have h : extra ≤ count := by omega
      simp only [distribute, List.sum_cons, ih extra h, Nat.succ_mul]
      omega

/-- Floor shares leave exactly the remainder. Every unit is assigned, and only
    the first pool % count ordered slots receive an extra unit. -/
theorem winners (pool count : Nat) (positive : 0 < count) :
    let share := pool / count
    let extra := pool % count
    subtractShares share count pool = some extra ∧
      (distribute share count extra).sum = pool ∧
      distribute share count extra =
        List.replicate extra (share + 1) ++ List.replicate (count - extra) share := by
  dsimp only
  have fits := Nat.le_of_lt (Nat.mod_lt pool positive)
  exact ⟨(subtractShares_exact ..).2 (Nat.div_add_mod pool count).symm,
    (distribute_sum _ _ _ fits).trans (Nat.div_add_mod pool count),
    distribute_in_order _ _ _ fits⟩

/-- Refunds succeed exactly at the total originally deposited at one stake per slot. -/
theorem refunds (pool count stake : Nat) :
    subtractShares stake count pool = some 0 ↔
      pool = (List.replicate count stake).sum := by
  simp [subtractShares_exact, List.sum_replicate_nat]

theorem skip_zero_claims (awards : List Nat) :
    (awards.filter (fun award => award != 0)).sum = awards.sum := by
  induction awards with
  | nil => rfl
  | cons award rest ih =>
    by_cases zero : award = 0 <;> simp [zero, ih]

/-- One successful claim reduces the selected slot and the session liability by
    the same amount. All preceding and subsequent slots retain their balances. -/
theorem partial_claim (before after : List Nat) (balance amount liability : Nat)
    (available : amount ≤ balance)
    (backed : liability = (before ++ balance :: after).sum) :
    liability - amount = (before ++ (balance - amount) :: after).sum := by
  simp only [List.sum_append, List.sum_cons] at *
  omega

end StockPayout
