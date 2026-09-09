# ONCM adapter changes

Upstream commit: 4c544ed4099c8227f07d5de77ad1e69fb0740a27, Apache-2.0.

1. Expose parser::parse_export_file for guest bytes input.
2. Add oncm.rs: require a closed Oncm.goal definition of type Prop; require a
   checked Oncm.solution theorem whose type is definitionally the goal or its
   constructed negation. No typing rule is removed or weakened.
3. Configure native reduction shortcuts: only Nat.succ and Nat.add have native
   arithmetic shortcuts, because their complete declarations are embedded in
   the pinned foundation. All other Nat operators use normal checked Lean
   definitions; their name-cache shortcut pointers are cleared. eagerReduce is
   also disabled. This changes optimization policy, not typing rules.

Security regression: profile v1 allowed a substituted Nat.mul definition to be
ignored by native literal reduction. A forged export replacing Nat.mul with
Nat.add was accepted for the proposition `1 * 1 = 1`. Profile v2 rejects that
export and accepts the unmodified arithmetic proof. No v1 certificate was
issued. See native-arithmetic-regression.json in the enclosing proof runtime.

4. Profile v3 allows exactly the three axiom declarations already present in
   the immutable foundation. No additional axiom can enter through a different
   structural Lean name with an identical string representation. Target lookup
   uses LeanDag::find_name and declaration-map identity rather than formatting.
   The lookup helper is exposed pub(crate) for this adapter. Ordinary Lean
   definitions and proofs still use the original kernel typing rules.

The v2 axiom-name case and v3 rejection are recorded in
axiom-policy-regression.json. No v2 certificate was issued either. Only v3 is
used by the final proof run and deployment descriptor.

The outer checker pins the foundation export bytes and the committed goal prefix.
Original parser checks duplicate declarations/backreferences; original serial
checker validates every declaration and its environment dependencies.
