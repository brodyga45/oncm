// Parse only the structural name/definition records needed to locate a prefix.
// The unchanged native kernel checker remains responsible for validating every
// term, declaration, axiom policy, foundation and proof in the exported bytes.
export function goalPrefix(exported, { registration = false } = {}) {
  if (!Buffer.isBuffer(exported) || !exported.length || exported.length > 16 * 1024 * 1024)
    throw Error('Expected a bounded nonempty export buffer');
  const names = new Map([[0, 'root']]);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let offset = 0, boundary;
  while (offset < exported.length) {
    const end = exported.indexOf(10, offset);
    if (end < 0) throw Error('Export must end on a complete newline record');
    const record = JSON.parse(decoder.decode(exported.subarray(offset, end)));
    offset = end + 1;
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error('Expected a JSON object record');
    if ('in' in record) {
      if (!Number.isSafeInteger(record.in) || record.in < 1 || names.has(record.in)) throw Error('Noncanonical name index');
      if ('str' in record) {
        const s = record.str;
        if (!s || !Number.isSafeInteger(s.pre) || !names.has(s.pre) || typeof s.str !== 'string') throw Error('Malformed structural string name');
        names.set(record.in, names.get(s.pre) === 'root' && s.str === 'Oncm' ? 'namespace'
          : names.get(s.pre) === 'namespace' && s.str === 'goal' ? 'goal' : 'other');
      } else names.set(record.in, 'other');
    }
    if (record.def && names.get(record.def.name) === 'goal') {
      if (boundary !== undefined) throw Error('Ambiguous canonical goal definition');
      boundary = offset;
    }
  }
  if (boundary === undefined) throw Error('Canonical structural Oncm.goal definition was not found');
  if (registration && boundary !== exported.length) throw Error('Registration export contains records after its goal');
  return exported.subarray(0, boundary);
}
