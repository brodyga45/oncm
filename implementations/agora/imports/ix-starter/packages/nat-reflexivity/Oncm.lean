def myConst : Nat := 42

def myId (x : Nat) : Nat := x

theorem myReflEq (n : Nat) : n = n := rfl

namespace Oncm
def goal : Prop := ∀ n : Nat, n = n
theorem solution : goal := myReflEq
end Oncm
