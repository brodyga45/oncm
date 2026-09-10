prelude

inductive False : Prop

namespace Oncm

def goal : Prop := ∀ P : Prop, P

end Oncm


namespace Oncm

theorem solution : goal → False := fun h => h False

end Oncm
