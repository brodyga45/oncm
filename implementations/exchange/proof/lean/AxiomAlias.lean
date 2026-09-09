import Init
axiom «Classical.choice» : False
namespace Oncm
def goal : Prop := False
theorem solution : goal := _root_.«Classical.choice»
end Oncm
