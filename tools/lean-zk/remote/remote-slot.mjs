import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class RemoteSlotBusy extends Error {
  constructor(active = null) {
    super('Another remote proof holds the shared slot; keep this job queued.');
    this.code = 'REMOTE_SLOT_BUSY'; this.active = active;
  }
}

// A short filesystem mutex protects only local metadata updates, never network
// work. It deliberately has no age-based eviction: elapsed time is not evidence
// that a submitted remote computation has stopped.
async function transaction(directory, operation) {
  if (!path.isAbsolute(directory)) throw Error('Shared remote slot directory must be absolute');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const mutex = path.join(directory, 'metadata-lock');
  try { await fs.mkdir(mutex); }
  catch (error) { if (error.code === 'EEXIST') throw new RemoteSlotBusy(); throw error; }
  try { return await operation(path.join(directory, 'active.json')); }
  finally { await fs.rmdir(mutex); }
}

async function load(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const same = (a, b) => a.requestDigest === b.requestDigest && a.requestCommit === b.requestCommit && a.repository === b.repository;

export function claimRemoteSlot(directory, request) {
  if (!/^[0-9a-f]{64}$/.test(request.requestDigest) || !/^[0-9a-f]{40}$/.test(request.requestCommit)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository)) throw Error('Invalid remote slot binding');
  return transaction(directory, async file => {
    const existing = await load(file);
    if (existing) {
      if (same(existing, request)) return existing;
      throw new RemoteSlotBusy({ repository: existing.repository, requestDigest: existing.requestDigest, requestCommit: existing.requestCommit });
    }
    const slot = { repository: request.repository, requestDigest: request.requestDigest,
      requestCommit: request.requestCommit, token: randomUUID(), createdAt: new Date().toISOString() };
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(slot), { mode: 0o600 }); await fs.rename(temporary, file);
    return slot;
  });
}

/** Call only after authoritative evidence that this remote run is terminal, or
 * after reconciling that no submission exists. Caller identity alone, a local
 * timeout, UI cancellation, or a process exit is insufficient. */
export function releaseRemoteSlot(directory, slot) {
  return transaction(directory, async file => {
    const existing = await load(file);
    if (!existing) return false;
    if (!same(existing, slot) || existing.token !== slot.token) throw Error('Cannot release a different remote request');
    await fs.unlink(file); return true;
  });
}
