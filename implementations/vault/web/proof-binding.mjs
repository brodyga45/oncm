import { AbiCoder, dataLength } from 'ethers';
import { CLAIM_DOMAIN } from '../sdk/external-certificates.mjs';

const abi = AbiCoder.defaultAbiCoder();
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// Encoding/binding check only. Original EVM verification remains the authority.
export function bindOutcomeCertificate(statement, outcome, certificate) {
  if (!statement || statement.kind !== 0 || ![1, 2].includes(Number(outcome))) return null;
  try {
    const [seal, journal] = abi.decode(['bytes', 'bytes'], certificate);
    if (dataLength(journal) !== 128 || !same(abi.encode(['bytes', 'bytes'], [seal, journal]), certificate)) return null;
    const [domain, goalHash, profileId, provedOutcome] = abi.decode(['bytes32', 'bytes32', 'bytes32', 'uint256'], journal);
    if (!same(domain, CLAIM_DOMAIN) || !same(goalHash, statement.goalHash)
      || !same(profileId, statement.profileId) || provedOutcome !== BigInt(outcome)) return null;
    return { statementId: statement.id, goalHash, profileId, outcome: Number(outcome), certificate };
  } catch { return null; }
}

export function proofBindingMatches(binding, statement, outcome, certificate) {
  return Boolean(binding && statement && statement.kind === 0 && statement.outcome === 0
    && same(binding.statementId, statement.id) && same(binding.goalHash, statement.goalHash)
    && same(binding.profileId, statement.profileId) && binding.outcome === Number(outcome)
    && same(binding.certificate, certificate));
}

export function bindProofJob(job, statement, outcome) {
  const input = job?.input, result = job?.result;
  if (input?.action !== 'prove' || !result?.certificate || !statement
    || !same(input.statementId, statement.id) || !same(input.goalHash, statement.goalHash)
    || !same(input.profileId, statement.profileId) || Number(input.outcome) !== Number(outcome)
    || !same(result.goalHash, statement.goalHash) || !same(result.profileId, statement.profileId)) return null;
  return bindOutcomeCertificate(statement, outcome, result.certificate);
}
