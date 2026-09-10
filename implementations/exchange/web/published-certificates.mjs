// Public immutable CI artifacts are bundled with this standalone application.
// Loading is not verification and cannot start a job or a transaction.
import trueRegistration from '../proof/profiles/perf05/certificates/true-registration.json' with { type: 'json' };
import trueProof from '../proof/profiles/perf05/certificates/true-proof.json' with { type: 'json' };
import falseRegistration from '../proof/profiles/perf05/certificates/false-registration.json' with { type: 'json' };
import falseRefutation from '../proof/profiles/perf05/certificates/false-refutation.json' with { type: 'json' };

const entries = [
  ['true-registration', 'True goal registration · CI3', trueRegistration],
  ['false-registration', 'False goal registration · CI5', falseRegistration],
  ['true-proof', 'YES proof · CI4', trueProof],
  ['false-refutation', 'NO refutation · CI6', falseRefutation],
];
export function publishedChoices({ profileId, goalHash, outcome, registration = false }) {
  return entries.filter(([, , artifact]) => artifact.profileId === profileId?.toLowerCase()
    && (registration ? artifact.outcome === 0 : artifact.outcome !== 0)
    && (!goalHash || artifact.goalHash === goalHash.toLowerCase())
    && (outcome === undefined || artifact.outcome === outcome))
    .map(([id, label, artifact]) => ({ id, label, profileId: artifact.profileId, goalHash: artifact.goalHash, outcome: artifact.outcome }));
}
export function loadPublishedCertificate(id, expected) {
  if (!publishedChoices(expected).some(choice => choice.id === id))
    throw Error('Published certificate does not match the selected profile, goal and outcome');
  return structuredClone(entries.find(([name]) => name === id)[2]);
}
export function assertWebJobAction(action) {
  if (action !== 'check') throw Error('Certificate generation is outside the current website scope; prepare a certificate externally and import it.');
}
