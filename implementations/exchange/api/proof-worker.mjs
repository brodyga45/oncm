import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
export const proofBudgets = Object.freeze({ check: 5, register: 30, prove: 120 });
/** No receipt fast-cache here. The pinned runner retains its own policy and
 * cryptographic checks. The outer guard has no lock; inner guards alone acquire
 * oncm-worker-UID.lock, avoiding nested acquisition of the same OS lock. */
export function createProofWorker(root) {
  return async (input, { signal, onDiagnostics, id }) => {
    signal.throwIfAborted();
    const runner = path.join(root, 'proof/runner.mjs'), guard = path.join(root, 'proof/resource-guard.py');
    await fs.access(runner); await fs.access(guard);
    const reports = path.join(root, 'data/proof-resource-reports');
    await fs.mkdir(reports, { recursive: true });
    const report = path.join(reports, `${id}.json`);
    const args = [guard, '--memory-mib', '2048', '--timeout', String(proofBudgets[input.action]), '--report', report,
      '--', process.execPath, runner];
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/python3', args, {
        cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          RAYON_NUM_THREADS: '2', GOMAXPROCS: '2', RISC0_DEV_MODE: '' }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '', err = '', fault;
      const abort = () => child.kill('SIGTERM');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input));
      child.stdout.on('data', b => {
        if (Buffer.byteLength(out) + b.length > 2_000_000) { fault = Error('Proof runner output exceeded 2 MB'); abort(); }
        else out += b.toString();
      });
      child.stderr.on('data', b => { err = (err + b.toString()).slice(-50_000); onDiagnostics(err); });
      child.on('error', e => { fault = e; });
      // The supervisor's close follows descendant cleanup. Abort alone must
      // never resolve/reject this Promise and release the p-queue slot early.
      child.on('close', code => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) return reject(signal.reason);
        if (fault) return reject(fault);
        let result;
        try { result = JSON.parse(out.trim()); } catch {}
        if (code !== 0 || !result || ['failed', 'error'].includes(result.status)) {
          const message = code === 124 ? `Proof job exceeded its ${proofBudgets[input.action]} second budget; worker stopped.`
            : code === 125 ? 'Proof job exceeded the 2 GiB memory budget; worker stopped.'
              : result?.diagnostics || err || out || `Runner exited ${code}`;
          return reject(Object.assign(Error(message), { result, report }));
        }
        resolve(result);
      });
    });
  };
}

