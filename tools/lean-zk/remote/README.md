# GitHub proof transport — future tooling

User decision, 2026-09-10: in-site certificate generation/ordering is deferred. This module is retained as future tooling and is not a current website completion gate.

This server-side module publishes an explicit public request using ordinary Git/SSH and reads a public CI result. It does **not** yet replace the three applications' local proof workers. No live request has been submitted through it; cancellation and restart reconciliation are incomplete. Expensive local proving remains disabled.

The companion workflow is `lean-zk-request.yml`. A server-owned, pinned base commit supplies the workflow and original prover. The publisher changes only `oncm-request.json`, then pushes `codex/proof-requests/<sha256-of-exact-request-bytes>`. CI publishes `result.json` on `codex/proof-results/<digest>`. Existing operator SSH access authorizes submission; the workflow token authorizes result publication. Credentials never enter the request or browser.

GitHub documents [push-triggered workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [workflow token behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Publishing a result with `GITHUB_TOKEN` does not recursively launch another ordinary push workflow.

## Interface

```js
const provider = createGithubProofProvider({
  repository,       // server configuration, never a client-selected target
  baseCommit,       // exact reviewed 40-hex commit containing the workflow
  directory,        // this app's persistent publisher and owned-job metadata
  slotDirectory,    // SAME operator-controlled absolute directory in all 3 apps
  profiles,         // immutable descriptors keyed by "perf05" / "v3"
  verifyProof,      // mandatory original EVM + governed bridge verification
});
await provider.submit({ owner, jobId, request, publicConsent: true, signal });
await provider.status({ owner, jobId, signal });
```

`owner` comes from the authenticated session. The persisted job UUID becomes the request nonce. Different owned jobs do not share a cancellable run merely because their mathematics matches. Same-job retries preserve exact request bytes and commit. A lost push response leaves a prepared record; retry inspects the exact remote ref before submitting again. Transient observation failures never start another run.

Use one provider instance per persistent publisher directory. State transitions, including concurrent status polls, are serialized. Guessing another owner's job UUID does not expose local metadata. Requests/results are public by explicit consent; this transport is unsuitable for private source.

Transport validation checks envelope/profile IDs, source/export sizes and SHA256, canonical base64, goal commitment and prefix equality. It does not prove source-to-export correspondence: the application must generate exports with its bounded native preparation before publication. CI checks the mathematics inside the immutable guest. A remote JSON `verified` flag is insufficient: the mandatory `verifyProof` callback must check exact goal/profile/outcome/image/journal and invoke the original verifier and governed bridge.

## One remote computation

`remote-slot.mjs` provides a persistent filesystem-coordinated slot shared by the three independent applications. `REMOTE_SLOT_BUSY` means an owned job stays queued. The workflow's global concurrency is an additional bound; GitHub's single pending slot is not a durable application queue.

A public terminal artifact alone cannot release the slot: the provider also checks the GitHub run's exact head, current attempt and completed state. An older artifact therefore cannot release it during an observed manual rerun. Network errors retain the reservation. Closing a page, local timeout and elapsed time are not remote completion.

The short metadata mutex has no time-based eviction. A crash during its transaction requires reconciliation; a prepared-but-unsubmitted reservation requires its exact-ref retry/recovery. Automatic startup reconciliation and remote cancellation remain necessary before enabling this backend. `cancellationSupported:false` must be respected: aborting a wait does not cancel GitHub computation. Manual CI reruns are outside the application's owned queue and require reconciliation before another dispatch.

## Evidence and remaining work

`node --test tools/lean-zk/remote/*.test.mjs` passes three suites using actual temporary local Git repositories, no network or credentials. Coverage includes one-file publication, ambiguous push recovery, owner separation, altered inputs/results, older CI attempts, concurrent status requests and shared-slot ownership. The certificate verifier is explicitly a transport-test stub, not additional ZK evidence.

Still required: per-app native preparation, queue/recovery, explicit public-source UI consent, reviewed deployed base commit, one actual new-input CI run, original proof verification/import, and browser registration/settlement in each application. See [CI request contract](../ci/REQUESTS.md).
