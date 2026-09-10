prelude

inductive False : Prop

namespace Oncm

def goal : Prop := ∀ P : Prop, P

theorem solution : goal → False := fun h => h False

end Oncm
