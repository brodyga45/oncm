// The statement metadata is public. Unpublished proof-job source and results
// remain private even when their goal matches a public statement.
// `owner` must come from the existing verified SIWE session, never a query/body.
export function packageJobs(jobs, statement, owner) {
  if (typeof owner !== 'string' || !owner) return [];
  return jobs.filter(job => typeof job.owner === 'string'
    && job.owner.toLowerCase() === owner.toLowerCase()
    && job.status === 'succeeded'
    && (job.input?.statementId === statement.id
      || (statement.goalHash && job.result?.goalHash === statement.goalHash)));
}
