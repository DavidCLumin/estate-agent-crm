export type BidRow = { amount: number; createdAt: string; bidder?: string };

export function getClientBidValidationError(args: { amount: number; highestBid: number | null }) {
  const { amount, highestBid } = args;
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter a valid bid amount';
  if (highestBid !== null && amount <= highestBid) {
    return `Bid must be higher than the current highest offer (${Number(highestBid).toLocaleString()})`;
  }
  return null;
}

export function applyOptimisticBid(args: {
  amount: number;
  highestBid: number | null;
  ownBids: BidRow[];
  bidHistory: BidRow[];
  createdAtIso: string;
}) {
  const { amount, highestBid, ownBids, bidHistory, createdAtIso } = args;
  return {
    highestBid: highestBid === null ? amount : Math.max(highestBid, amount),
    ownBids: [{ amount, createdAt: createdAtIso }, ...ownBids],
    bidHistory: [{ amount, createdAt: createdAtIso, bidder: 'You' }, ...bidHistory],
  };
}

