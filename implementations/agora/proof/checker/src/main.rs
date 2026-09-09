use std::{env, fs};
fn main() {
    let args: Vec<String> = env::args().collect();
    let export = fs::read(&args[1]).unwrap();
    let goal_len: usize = args[2].parse().unwrap();
    let outcome: u8 = args[3].parse().unwrap();
    let result = oncm_lean_checker::check(goal_len,&export,outcome);
    println!("{}",result.iter().map(|b|format!("{b:02x}")).collect::<String>());
}
