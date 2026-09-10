// An epoch distinguishes A → B → A navigation and competing async imports.
export function createProofSelection() {
  let statementId='',epoch=0;
  return {
    select(id) { statementId=id;epoch++; },
    begin() { return {statementId,epoch:++epoch}; },
    current(ticket) { return ticket?.statementId===statementId&&ticket.epoch===epoch; }
  };
}

export function assertProofBinding(binding,statement,outcome,certificate) {
  if(binding&&(binding.statementId!==statement?.id||binding.goalHash!==statement.goalHash
    ||binding.profileId!==statement.profileId||binding.outcome!==Number(outcome)
    ||binding.certificate!==certificate))throw Error('Imported certificate no longer matches the selected statement/outcome');
}
