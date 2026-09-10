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
    const ordered = db.comments
      .filter((c) => !statementId || c.statementId === statementId)
      .map(decorate)
      .sort(
        (a, b) =>
          (sort === 'top' ? b.score - a.score : 0) ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
    // Public cross-statement activity keeps its existing flat ordering.
    if (!statementId) return ordered;
    const byId = new Map(ordered.map((c) => [c.id, c]));
    const parents = new Map(), fallback = new Map();
    for (const c of ordered) {
      const validParent = c.parentId && byId.has(c.parentId);
      parents.set(c.id, validParent ? c.parentId : null);
      if (c.parentId && !validParent) fallback.set(c.id, 'missing-parent');
    }
    // Historical data can contain cycles. Break one deterministic edge per
    // cycle in the view only; retain every original parentId and stored row.
    const finished = new Set();
    for (const c of ordered) {
      const trail = [], positions = new Map();
      let id = c.id;
      while (id !== null && !finished.has(id) && !positions.has(id)) {
        positions.set(id, trail.length);trail.push(id);id = parents.get(id);
      }
      if (positions.has(id)) {
        const root = trail.slice(positions.get(id)).sort()[0];
        parents.set(root, null);fallback.set(root, 'cycle');
      }
      for (const visited of trail) finished.add(visited);
    }
    const children = new Map(), roots = [];
    for (const c of ordered) {
      const parent = parents.get(c.id);
      if (parent === null) roots.push(c);
      else {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(c);
      }
    }
    // Root order already reflects Top/New. Reply votes cannot move a branch.
    for (const replies of children.values()) replies.sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const result = [], stack = roots.slice().reverse().map((c) => ({ c, depth: 0, root: c.id }));
    while (stack.length) {
      const { c, depth, root } = stack.pop();
      result.push({ ...c, depth, threadRootId: root, threadParentId: parents.get(c.id), threadFallback: fallback.get(c.id) ?? null });
      const replies = children.get(c.id) ?? [];
      for (let i = replies.length - 1; i >= 0; i--) stack.push({ c: replies[i], depth: depth + 1, root });
    }
    return result;
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
