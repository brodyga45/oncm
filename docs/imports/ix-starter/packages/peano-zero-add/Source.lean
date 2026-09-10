namespace Tests.Ix.Kernel.TutorialDefs

inductive TN : Type where | zero : TN | succ : TN → TN

noncomputable def TN.add : TN → TN → TN :=
  TN.rec (fun m => m) (fun _ ih m => (ih m).succ)

theorem tnAddZero : ∀ m, TN.add TN.zero m = m := fun _ => rfl

end Tests.Ix.Kernel.TutorialDefs
