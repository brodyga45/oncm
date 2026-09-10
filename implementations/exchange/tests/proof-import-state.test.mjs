import test from "node:test";
import assert from "node:assert/strict";
import { createProofImportGuard } from "../web/proof-import-state.mjs";

test("an asynchronous certificate cannot survive A → B → A market navigation", () => {
  const guard = createProofImportGuard(), wallet = {};
  guard.select("market-a/yes", wallet);
  const pending = guard.begin();
  guard.select("market-b/yes", wallet);
  guard.select("market-a/yes", wallet);
  assert.equal(guard.current(pending), false);
});
test("outcome edits, wallet switches, unmount, and a newer import invalidate pending verification", () => {
  const guard = createProofImportGuard(), wallet = {};
  guard.select("a/yes", wallet);
  let pending = guard.begin();
  guard.select("a/no", wallet); assert.equal(guard.current(pending), false);
  pending = guard.begin(); guard.select("a/no", {}); assert.equal(guard.current(pending), false);
  pending = guard.begin(); guard.invalidate(); assert.equal(guard.current(pending), false);
  pending = guard.begin(); const newer = guard.begin();
  assert.equal(guard.current(pending), false); assert.equal(guard.current(newer), true);
});
test("ordinary rerenders of the same proof form preserve its pending verification", () => {
  const guard = createProofImportGuard(), wallet = {};
  guard.select("a/yes/exact-goal-and-profile", wallet);
  const pending = guard.begin();
  guard.select("a/yes/exact-goal-and-profile", wallet);
  assert.equal(guard.current(pending), true);
});
