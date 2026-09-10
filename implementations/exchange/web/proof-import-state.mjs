// A generation distinguishes A → B → A form edits and overlapping imports.
export function createProofImportGuard() {
  let key, client, generation = 0;
  return {
    select(nextKey, nextClient) {
      if (key !== nextKey || client !== nextClient) {
        key = nextKey; client = nextClient; generation++;
      }
    },
    begin() { return ++generation; },
    current(ticket) { return ticket === generation; },
    invalidate() { generation++; },
  };
}
