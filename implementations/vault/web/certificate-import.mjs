// Async ownership lives here so the web can discard obsolete file/API results.
// This controller does not send transactions or treat imported JSON as authority.
export function createCertificateImporter({ publish, loadCatalog }) {
  let state = { catalog: [], selected: 'perf05', input: '', review: null,
    verifiedEntry: null, loading: false, error: '' };
  let epoch = 0, catalogEpoch = 0, client, disposed = false;
  const update = patch => { state = { ...state, ...patch }; if (!disposed) publish(state); };
  const invalidate = () => { epoch++; update({ review: null, verifiedEntry: null, loading: false, error: '' }); };
  const current = (ticket, capturedClient) => !disposed && ticket === epoch && capturedClient === client;
  const begin = () => { invalidate(); update({ loading: true }); return epoch; };
  const failure = (error, ticket, capturedClient) => {
    if (current(ticket, capturedClient)) update({ error: error.shortMessage || error.message });
  };
  return {
    get state() { return state; },
    setClient(value) { if (value !== client) { client = value; invalidate(); } },
    setInput(input) { invalidate(); update({ input }); },
    setProfile(selected) { invalidate(); update({ selected }); },
    dispose() { epoch++; disposed = true; },
    async refresh() {
      const ticket = epoch, catalogTicket = ++catalogEpoch, capturedClient = client;
      try {
        const catalog = await loadCatalog();
        // Public catalog loading must survive typing/file/wallet changes before
        // the first response. It cannot overwrite any certificate or review.
        if (!disposed && catalogTicket === catalogEpoch) update({ catalog });
      } catch (error) { failure(error, ticket, capturedClient); }
    },
    async readFile(file) {
      if (!file) return;
      const ticket = begin(), capturedClient = client;
      try {
        if (file.size > 65536) throw Error('verified.json must be at most 64 KiB');
        const input = await file.text();
        if (input.length > 65536) throw Error('verified.json must be at most 64 KiB');
        if (current(ticket, capturedClient)) update({ input });
      } catch (error) { failure(error, ticket, capturedClient); }
      finally { if (current(ticket, capturedClient)) update({ loading: false }); }
    },
    async verify() {
      const ticket = begin(), capturedClient = client;
      const submitted = state.input, selected = state.selected;
      try {
        if (!capturedClient) throw Error('SDK is not ready');
        if (submitted.length > 65536) throw Error('verified.json must be at most 64 KiB');
        const catalogTicket = ++catalogEpoch;
        const catalog = await loadCatalog();
        if (!disposed && catalogTicket === catalogEpoch) update({ catalog });
        if (!current(ticket, capturedClient)) return;
        const entry = catalog.find(item => item.descriptor.tag === selected);
        if (!entry) throw Error('Selected proof profile is not in the public catalog');
        const review = await capturedClient.verifyExternalCertificate(
          JSON.parse(submitted), entry.descriptor, entry.deployment?.bridge);
        if (current(ticket, capturedClient)) update({ review, verifiedEntry: entry });
      } catch (error) { failure(error, ticket, capturedClient); }
      finally { if (current(ticket, capturedClient)) update({ loading: false }); }
    },
  };
}
