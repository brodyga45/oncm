#![no_main]
use risc0_zkvm::guest::env;
risc0_zkvm::guest::entry!(main);
fn main() {
    let goal_len: u32 = env::read();
    let outcome: u8 = env::read();
    let export: Vec<u8> = env::read();
    let journal = oncm_lean_checker::check(goal_len as usize,&export,outcome);
    env::commit_slice(&journal);
}
