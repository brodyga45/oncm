const ONE = 10n ** 18n;
const ceilDiv = (a, b) => (a + b - 1n) / b;
// Mirrors ProtocolFeeController._receiveAggregateFees rounding, using the
// aggregate percentage returned by the original on-chain controller.
export function creatorFromAggregate(amount, protocol, creator, aggregate) {
  const [n, p, c, a] = [amount, protocol, creator, aggregate].map(BigInt);
  if (n === 0n || c === 0n) return 0n;
  if (p === 0n) return n;
  if (a <= 0n) throw Error('Invalid aggregate fee percentage');
  const total = ceilDiv(n * ONE, a);
  const protocolPart = ceilDiv(total * p, ONE);
  if (protocolPart > n) throw Error('Controller rounding would exceed collected amount');
  return n - protocolPart;
}
