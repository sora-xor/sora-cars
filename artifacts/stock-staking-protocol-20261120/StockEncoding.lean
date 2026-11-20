import StockTick

namespace StockEncoding
open StockRows

-- Seven independently represented Goldilocks words in native register order.
def words (r : Reg) : Fin 7 → Int := fun j =>
  match j.val with
  | 0 => r.p | 1 => r.x | 2 => r.s | 3 => r.v | 4 => r.e
  | 5 => if r.done then 1 else 0 | _ => r.stamp

def holds (a : Car) (j : Fin 7) := words (pack a) j % P

theorem physicalInjective (a b : Car) (tick : Nat) (line : Int)
    (inside : tick≤8100) (track : 0≤line ∧ line≤7200000)
    (ha : invariant line tick a) (hb : invariant line tick b)
    (same : ∀ j, holds a j = holds b j) : a=b := by
  obtain ⟨ap,ax,aspeed,av,ae,af⟩ := a
  obtain ⟨bp,bx,bspeed,bv,be,bf⟩ := b
  simp only [invariant] at ha hb
  have hp := same 0; have hx := same 1; have hs := same 2; have hv := same 3
  have he := same 4; have hf := same 5; have ht := same 6
  simp [holds,words,pack] at hp hx hs hv he hf ht
  have p := smallPinUnique ap bp (by omega) (by omega) (by omega) (by omega) hp
  have x := smallPinUnique ax bx (by omega) (by omega) (by omega) (by omega) hx
  have s := smallPinUnique aspeed bspeed (by omega) (by omega) (by omega) (by omega) hs
  have v := smallPinUnique av bv (by omega) (by omega) (by omega) (by omega) hv
  have e := smallPinUnique ae be (by omega) (by omega) (by omega) (by omega) he
  subst bp; subst bx; subst bspeed; subst bv; subst be
  cases af <;> cases bf <;> simp_all [P] <;> omega

-- The complete active row now needs only the semantic identity for the wire carrying the
-- computed register value, separately from the generic builder's polynomial next-state gate.
theorem wordFromWire (old next wire expected : Int) (active : Bool)
    (gate : (next-old-(if active then (1:Int) else 0)*(wire-old)) % P = 0)
    (wireSemantics : active = true → wire % P = expected % P) :
    next % P = (if active then expected else old) % P := by
  have h := activeGateWord next old wire active gate
  cases active <;> simp_all

end StockEncoding
