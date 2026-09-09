import Init
namespace Oncm
-- Lean core proves that zero differs from one.
def goal : Prop := (0 : Nat) = 1
theorem solution : ¬ goal := Nat.zero_ne_one
end Oncm
