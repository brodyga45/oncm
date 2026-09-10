# Ix tnAddZero under the existing perf05 profile

2026-09-10. **Real Lean compilation, native kernel verification and zkVM execution passed. No ZK certificate was generated.** The resolution executor used **five segments**, so the proposed one-segment admission target was not met. No further computation was attempted.

## Exact imported statement

The original [Ix source](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/Tests/Ix/Kernel/TutorialDefs.lean#L135), commit `4c91254346284dcd984f1940f2c527114b1c5190`, lines135–140, defines a custom inductive Peano type, addition by its recursor, and this theorem:

```lean
inductive TN : Type where | zero : TN | succ : TN → TN

noncomputable def TN.add : TN → TN → TN :=
  TN.rec (fun m => m) (fun _ ih m => (ih m).succ)

theorem tnAddZero : ∀ m, TN.add TN.zero m = m := fun _ => rfl
```

Those source bytes and the original namespace `Tests.Ix.Kernel.TutorialDefs` are preserved. The starter package's `Oncm.goal` and `Oncm.solution` wrapper is also unchanged. The sole additional wrapper change is `prelude` followed by explicit `import Init`, making the previously implicit import visible. Standard Lean `False` is selected as the first exporter root; its exact export matches the existing perf05 foundation. No custom equality, Nat shortcut, theorem-body substitution or trusted axiom was introduced. The full Ix test harness and unrelated test axioms were already excluded by the documented starter extraction; this is not verification of that entire test module or of all Mathlib.

The [standalone source](OncmInput.lean), [verbatim excerpt](upstream-excerpt.lean) and [provenance](source-provenance.json) record this transformation. The entire original upstream file has SHA-256 `76039425d894c4fe05760bb9a84bf2dc3d5ff333a5403cf049841389ecb6c794`. Local code asserted that the selected upstream bytes occur unchanged in the standalone source.

## Bindings and guarantees

| Binding | Value |
| --- | --- |
| Exact profileId | `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10` |
| Unchanged imageId | `0x296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb` |
| Packed guest SHA-256 | `0f57d516124e0fe3e36ed3a0957e3321536d872f55826bc555319c1af3a4f208` |
| Foundation SHA-256; size | `94661738a0c260b50a6dc27a09015793d2c0205919f97448a1a4937d13d12124`; 1,073 bytes |
| New goalHash; size | `0x84188c093e8d3058be7042339eebc5e03cac02af07538275ff26f49e70b3291f`; 8,517 bytes |
| Proof export SHA-256; size | `644fb1290b0511bef8f0d2985b5b7f8385e2a93bb911c88e1d3e4788836998c3`; 9,872 bytes |
| Standalone source SHA-256 | `f7f985ae7bd0da26eb8ebdad3e5ab4484e5f411784ae7ba1a0cd157ce83bcfe5` |
| Outcome exercised | `1`, proof of the exact registered mathematical goal |

The export roots were `False`, `Oncm.goal`, `Oncm.solution`. The goal is the exact prefix ending at the structural `Oncm.goal` definition; it begins with the immutable foundation. The complete export contains **zero axioms** and14 declarations: False/False.rec; TN, TN.zero, TN.succ, TN.rec; Eq, Eq.refl, Eq.rec; TN.add; Oncm.goal; rfl; tnAddZero; Oncm.solution. The latter theorem declarations use the export format's `thm` record key.

The existing perf05 checker parses and checks **all** goal declarations and all full-proof declarations, then checks the canonical closed Prop and solution type. Nat/string extensions remain disabled. This is an accepted new arithmetic input to a generic checker, not a new image or an allowlisted theorem inside the kernel. Imported Init declarations that are not reachable from these roots do not enter the export or the proved dependency closure.

The economic commitment is the exact kernel goal export, not a ZK proof of the `.lean` source-to-export compilation. Native Lean/exporter reproducibility and the source excerpt establish the documented source relationship offchain. The emitted journal binds domain, new goalHash, the existing perf05 profile, and outcome1; both native and executor journals matched exactly. Existing v3 starter hash `0x267490085041d732f6dd20c88b7ffbb970315639deb3c71f12b97370d0e600ec` remains a different commitment and was not relabelled.

## One authorized measured run

Every command ran sequentially with the shared `/private/tmp/oncm-worker-501.lock`, two threads, a512MiB sampled process-tree guard, and no installs or builds of tools. Lean and exporter also used the OS sandbox. Existing Lean4.33.1 and exporter commit `15f6055e299ad5b89345e533cc2192f4cc00f659` with the already promoted standard-map-capacity patch were used; binary pins are asserted by [admission.py](admission.py). The guard is a sampled watchdog, not a kernel hard memory cap.

| Stage | Guard limit | Wall seconds | Sampled peak tree footprint |
| --- | --- | ---: | ---: |
| Lean compile | 512MiB /5s | 2.230 | 89,986,256 B /85.817MiB |
| Single dependency export | 512MiB /5s | 0.327 | 60,494,840 B /57.692MiB |
| Native goal + proof check | 512MiB /5s | 0.545 | 11,010,408 B /10.500MiB |
| Original executor, outcome1 | 512MiB /10s | 0.222 | 31,458,360 B /30.001MiB |

All four reports have exit0, reason `completed`, and empty cleanup errors. The complete orchestration took3.897s in the shell tool; stage sums omit small orchestration overhead. These are one-run observations, not cold/warm latency distributions. Short-lived peaks between100ms samples can be missed.

Guest phase diagnostics place input completion at122,800 cycles, goal parse at1,050,347, goal declaration checking at1,825,610, goal binding at1,827,955, full-proof checks plus journal at3,859,644, and commit at3,860,705. The host reports **five segments**. This explains why small source text alone is insufficient to predict proving cost: this input independently checks custom inductive/recursor/equality declarations. Phase counters are diagnostics, not authenticated receipt fields. A separate registration-only executor was not run; its segment count and proving time must not be claimed from this result.

No STARK/Groth16 proof, certificate, CI dispatch, chain transaction, deployment or application change occurred. The next CI adapter can accept this bundle as data, but should reject it under a one-segment budget; raising the approved remote budget or selecting another input requires a separate explicit decision.
