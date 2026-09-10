prelude

inductive False : Prop

namespace Oncm

def goal : Prop := ∀ P : Prop, P → P

theorem solution : goal := fun P h => h

end Oncm
