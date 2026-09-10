# Exact monetary input boundaries

Root's manual LP smoke reached the genuine perf05 market at blocks32–35.
Entering20 in the LP input produced a JavaScript number through Vue's implicit
numeric coercion for `type="number"`. Viem's string parser then failed with
`value.split is not a function`; the chain stayed at block35.

All monetary input fields now use decimal text with a decimal keyboard hint.
This preserves the user's original precision instead of converting through a
JavaScript floating-point number. The shared `sdk/amounts.mjs` boundary accepts
decimal strings and legacy safe integer numbers (so numeric20 is supported).
Fractional/unsafe JavaScript numbers must be supplied as strings; exponents,
negative/invalid values, excessive fractional digits and uint256 overflow
are rejected, never silently rounded.

Token/LP amounts use18 decimals. Fee percentages scale exactly to the AMM's
18-decimal fraction; slippage uses integer basis points (at most2 fractional
percent digits), allocation percentages use4 fractional digits. The earlier
`Number`/`Math.round` conversion steps are removed from transaction inputs.
The UI's original fee/slippage maxima10%/20% are now enforced by parsers.
Initial funding/fee and LP amount are parsed before any metadata/approval/pool
creation effects. Existing SDK transaction methods still take bigint base
units; `parseTokenAmount` is exported as the explicit human-decimal adapter.
This does not change the denomination of existing SDK methods.

Validation: numeric20 and string20 agree; one wei and a large exact18-place
decimal are preserved; malformed/overprecision/unsafe-number inputs reject;
fee/slippage/allocation scaling is exact; SDK base-unit methods reject
ambiguous number/string values.17/17 lightweight amount/governance/Ix/proof
regression tests passed. Final Vite build passed under1GiB/30s guard in1.433s,
peak280,487,904bytes (~267.5MiB), with empty cleanupErrors. Report:
`/private/tmp/agora-amount-auth-final-vite-resources.json`.

No LP/trading/split/merge or other transaction was submitted by this fix.
Read-only health after the changes showed chain31371 still at block35.
The subsequent real browser retry of LP20 belongs to root's manual journal.
