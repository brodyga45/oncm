import crypto from 'node:crypto';
export function community(db, save = () => {}) {
  db.profiles ??= {};
  db.votes ??= {};
  db.comments ??= [];
  const address = (a) => {
    if (!/^0x[0-9a-f]{40}$/i.test(a || '')) throw Error('Invalid wallet address');
    return a.toLowerCase();
  };
  const decorate = (c) => ({
    ...c,
    score: Object.values(db.votes[c.id] || {}).reduce((a, b) => a + b, 0),
    votes: { ...(db.votes[c.id] || {}) },
    profile: profile(c.author),
  });
  function profile(a) {
    const key = address(a);
    return {
      address: a,
      ...(db.profiles[key] || { displayName: '', bio: '' }),
      commentCount: db.comments.filter((c) => c.author.toLowerCase() === key).length,
    };
  }
  function updateProfile(actor, input) {
    const key = address(actor);
    if (
      typeof input.displayName !== 'string' ||
      input.displayName.length > 40 ||
      typeof input.bio !== 'string' ||
      input.bio.length > 1000
    )
      throw Error('Display name ≤40 and bio ≤1000 characters required');
    db.profiles[key] = {
      displayName: input.displayName.trim(),
      bio: input.bio.trim(),
      updatedAt: new Date().toISOString(),
    };
    save();
    return profile(actor);
  }
  function list(statementId, sort = 'top') {
    return db.comments
      .filter((c) => !statementId || c.statementId === statementId)
      .map(decorate)
      .sort(
        (a, b) =>
          (sort === 'top' ? b.score - a.score : 0) ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
  }
  function create(actor, input) {
    address(actor);
    const { statementId, text, parentId = null } = input;
    if (
      !/^0x[0-9a-f]{64}$/i.test(statementId) ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 4000
    )
      throw Error('Statement ID and 1–4000 characters required');
    if (parentId) {
      const parent = db.comments.find((c) => c.id === parentId);
      if (!parent || parent.statementId !== statementId)
        throw Error('Reply parent must belong to the same statement');
    }
    const c = {
      id: crypto.randomUUID(),
      statementId,
      author: actor,
      text: text.trim(),
      parentId,
      createdAt: new Date().toISOString(),
      history: [],
    };
    db.comments.push(c);
    save();
    return decorate(c);
  }
  function edit(actor, id, text) {
    const c = db.comments.find((c) => c.id === id);
    if (!c || address(c.author) !== address(actor)) throw Error('Only the author can edit');
    if (typeof text !== 'string' || !text.trim() || text.length > 4000)
      throw Error('1–4000 characters required');
    c.history.push({ text: c.text, editedAt: new Date().toISOString() });
    c.text = text.trim();
    save();
    return decorate(c);
  }
  function vote(actor, id, value) {
    const key = address(actor),
      c = db.comments.find((c) => c.id === id);
    if (!c) throw Error('Unknown comment');
    if (address(c.author) === key) throw Error('Self-votes are not allowed');
    if (![-1, 0, 1].includes(value)) throw Error('Vote must be -1, 0 or 1');
    db.votes[id] ??= {};
    if (value === 0) delete db.votes[id][key];
    else db.votes[id][key] = value;
    save();
    return decorate(c);
  }
  return { profile, updateProfile, list, create, edit, vote };
}
