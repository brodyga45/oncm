namespace Tests.Ix.Kernel.TutorialDefs

inductive TN : Type where | zero : TN | succ : TN → TN

noncomputable def TN.add : TN → TN → TN :=
  TN.rec (fun m => m) (fun _ ih m => (ih m).succ)

theorem tnAddZero : ∀ m, TN.add TN.zero m = m := fun _ => rfl
theorem tnAddSucc : ∀ n m, TN.add (TN.succ n) m = TN.succ (TN.add n m) := fun _ _ => rfl

end Tests.Ix.Kernel.TutorialDefs

namespace Oncm
def goal : Prop := ∀ n m : Tests.Ix.Kernel.TutorialDefs.TN, Tests.Ix.Kernel.TutorialDefs.TN.add (.succ n) m = .succ (Tests.Ix.Kernel.TutorialDefs.TN.add n m)
theorem solution : goal := Tests.Ix.Kernel.TutorialDefs.tnAddSucc
end Oncm
