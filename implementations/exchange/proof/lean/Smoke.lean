import Init

namespace Oncm

-- Published theorem used for the small end-to-end fixture:
-- Lean core Init/Data/Nat/Basic.lean, Nat.add_comm.
def goal : Prop := ∀ a b : Nat, a + b = b + a

theorem solution : goal := Nat.add_comm

end Oncm
