use anyhow::{ensure,Result};
use risc0_zkvm::{default_executor,default_prover,ExecutorEnv,ProverOpts,Receipt};
use std::{env,fs,path::Path};
fn main()->Result<()> {
    ensure!(env::var("RISC0_DEV_MODE").unwrap_or_default().is_empty(),"dev mode forbidden");
    let args:Vec<String>=env::args().collect();
    let command=&args[1];let elf=fs::read(&args[2])?;
    if command=="pack" {
        let binary=risc0_binfmt::ProgramBinary::new(&elf,risc0_zkos_v1compat::V1COMPAT_ELF).encode();
        let image=risc0_binfmt::compute_image_id(&binary)?;
        fs::write(&args[3],binary)?;
        println!("{}",serde_json::json!({"imageId":image.to_string()}));return Ok(());
    }
    if command=="compress" || command=="inspect" {
        let receipt:Receipt=bincode::deserialize(&fs::read(&args[3])?)?;
        let image=risc0_binfmt::compute_image_id(&elf)?;receipt.verify(image)?;
        let receipt=if command=="compress" {default_prover().compress(&ProverOpts::groth16(),&receipt)?} else {receipt};
        receipt.verify(image)?;
        if command=="compress" {fs::write(&args[4],bincode::serialize(&receipt)?)?;}
        let groth=receipt.inner.groth16()?;
        let seal=[&groth.verifier_parameters.as_bytes()[..4],groth.seal.as_slice()].concat();
        println!("{}",serde_json::json!({"imageId":image.to_string(),"journal":hex::encode(&receipt.journal.bytes),"seal":hex::encode(seal)}));return Ok(());
    }
    let export=fs::read(&args[3])?;
    let goal_len:u32=args[4].parse()?;let outcome:u8=args[5].parse()?;
    let input=ExecutorEnv::builder().segment_limit_po2(20)
        .write(&goal_len)?.write(&outcome)?.write(&export)?.build()?;
    if command=="execute" {
        let session=default_executor().execute(input,&elf)?;
        println!("{}",serde_json::json!({"journal":hex::encode(session.journal.bytes),"segments":session.segments.len()}));
    } else {
        let kind=if command=="groth16" {ProverOpts::groth16()} else {ProverOpts::succinct()};
        let info=default_prover().prove_with_opts(input,&elf,&kind)?;
        let image=risc0_binfmt::compute_image_id(&elf)?;
        info.receipt.verify(image)?;
        let output=Path::new(&args[6]);fs::write(output,bincode::serialize(&info.receipt)?)?;
        println!("{}",serde_json::json!({"imageId":image.to_string(),"journal":hex::encode(&info.receipt.journal.bytes),"receipt":output,"stats":format!("{:?}",info.stats)}));
    }
    Ok(())
}
