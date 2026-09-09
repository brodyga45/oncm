//! A narrow protocol adapter around the unmodified NanoDa typing rules.
//! The goal package is a byte prefix of the proof package. The foundation is
//! embedded in the verifier program; dependency declarations cannot be replaced.
use nanoda_lib::{env::Declar, parser::parse_export_file, util::Config};
#[cfg(target_os = "zkvm")]
use risc0_zkvm::sha::rust_crypto::{Digest, Sha256};
#[cfg(not(target_os = "zkvm"))]
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub const FOUNDATION: &[u8] = include_bytes!("../../lean/foundation.ndjson");
pub const PROFILE: &[u8] = b"oncm.lean4.33.1.nanoda.4c544ed4.logic.perf05.zeroaxiom";

pub fn sha256(bytes: &[u8]) -> [u8; 32] { Sha256::digest(bytes).into() }

pub fn check(goal_len: usize, export: &[u8], outcome: u8) -> [u8; 128] {
    check_with_trace(goal_len, export, outcome, |_| {})
}

// Timing callbacks have no access to the environment and do not affect checks.
// The guest records untrusted diagnostic cycle counts; none enter the journal.
pub fn check_with_trace<F: FnMut(&'static str)>(goal_len: usize, export: &[u8], outcome: u8, mut trace: F) -> [u8; 128] {
    assert!(outcome <= 2, "unknown certificate kind");
    assert!(export.len() <= 16 * 1024 * 1024, "profile export size limit");
    assert!(goal_len >= FOUNDATION.len() && goal_len <= export.len());
    assert!(export.starts_with(FOUNDATION), "foundation mismatch");
    assert_eq!(export[goal_len - 1], b'\n', "goal boundary must be a record boundary");
    if outcome == 0 { assert_eq!(goal_len, export.len(), "registration contains only goal"); }
    let config = || -> Config { serde_json::from_str(r#"{
      "use_stdin":true,"permitted_axioms":[],
      "unpermitted_axiom_hard_error":true,"num_threads":1,
      "nat_extension":false,"string_extension":false,
      "print_success_message":false,"print_axioms":false
    }"#).unwrap() };
    // Ensure the goal exists in the committed prefix, not merely somewhere in
    // an uncommitted suffix supplied by the prover.
    trace("goal_preflight");
    let (mut goal, skipped) = parse_export_file(Cursor::new(&export[..goal_len]), config()).unwrap();
    trace("goal_parse");
    assert!(skipped.is_empty());
    // This separately pinned constructive profile contains no axioms.
    // Reject every axiom, including structurally aliased names.
    assert_eq!(goal.declars.values().filter(|d|matches!(d,Declar::Axiom{..})).count(),0,"axioms forbidden in this profile");
    goal.configure_oncm_reduction();
    trace("goal_policy");
    goal.check_all_declars();
    trace("goal_check_declarations");
    goal.check_oncm_claim(0);
    trace("goal_canonical_claim");
    if outcome != 0 {
        let (mut proof, skipped) = parse_export_file(Cursor::new(export), config()).unwrap();
        assert!(skipped.is_empty());
        assert_eq!(proof.declars.values().filter(|d|matches!(d,Declar::Axiom{..})).count(),0,"axioms forbidden in this profile");
        proof.configure_oncm_reduction();
        proof.check_all_declars();
        proof.check_oncm_claim(outcome);
        assert!(proof.declars.values().any(|d| matches!(d, Declar::Theorem { .. })));
    }
    // ABI-compatible four words: domain, goal hash, profile hash, kind/outcome.
    let mut journal = [0u8;128];
    journal[..32].copy_from_slice(&sha256(b"ONCM_LEAN_CLAIM_V1"));
    journal[32..64].copy_from_slice(&sha256(&export[..goal_len]));
    let mut profile = PROFILE.to_vec();
    profile.extend_from_slice(&sha256(FOUNDATION));
    journal[64..96].copy_from_slice(&sha256(&profile));
    journal[127] = outcome;
    trace("journal");
    journal
}
