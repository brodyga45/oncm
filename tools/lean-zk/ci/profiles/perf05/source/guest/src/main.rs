#![no_main]
use risc0_zkvm::guest::env;
risc0_zkvm::guest::entry!(main);

fn main() {
    let start = env::cycle_count();
    let mut phases = Vec::with_capacity(12);
    phases.push(("start", start));
    // Compatible with the v3 host's serde wire format, read in bulk.
    let mut header = [0u32; 3];
    env::read_slice(&mut header);
    let goal_len = header[0] as usize;
    let outcome = header[1];
    let export_len = header[2] as usize;
    assert!(outcome <= 2, "unknown certificate kind");
    assert!(export_len <= 16 * 1024 * 1024, "profile export size limit");
    assert!(goal_len >= oncm_lean_checker::FOUNDATION.len() && goal_len <= export_len);
    if outcome == 0 { assert_eq!(goal_len, export_len); }
    let mut words = vec![0u32; export_len];
    env::read_slice(&mut words);
    phases.push(("input_words", env::cycle_count()));
    let mut export = Vec::with_capacity(export_len);
    for word in &words {
        assert!(*word <= u8::MAX as u32, "noncanonical serialized byte");
        export.push(*word as u8);
    }
    drop(words);
    phases.push(("input", env::cycle_count()));
    let journal = oncm_lean_checker::check_with_trace(goal_len, &export, outcome as u8, |label| {
        phases.push((label, env::cycle_count()));
    });
    phases.push(("checker_return", env::cycle_count()));
    env::commit_slice(&journal);
    phases.push(("commit", env::cycle_count()));
    // Logging happens only after all measured phases and the normal journal.
    for (label, cycle) in phases {
        env::log(&format!("ONCM_PHASE {label} {cycle}"));
    }
}
