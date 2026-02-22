import type { Property, Bid } from '@prisma/client';
import { AppError } from '../../lib/errors';

export function validateBidSubmission(args: {
  property: Pick<Property, 'biddingMode' | 'biddingDeadline' | 'minimumOffer'>;
  latestBid: Pick<Bid, 'amount'> | null;
  amount: number;
  now: Date;
}) {
  const { property, latestBid, amount, now } = args;
  if (property.biddingDeadline && now > property.biddingDeadline) {
    throw new AppError(409, 'Bidding is closed', 'BIDDING_CLOSED');
  }

  const minimumOffer = property.minimumOffer ? Number(property.minimumOffer) : 0;
  if (amount < minimumOffer) {
    throw new AppError(409, 'Bid is below the minimum acceptable offer', 'BELOW_MINIMUM_OFFER');
  }

  if (property.biddingMode === 'OPEN' && latestBid) {
    const highest = Number(latestBid.amount);
    if (amount <= highest) {
      throw new AppError(409, 'Bid must be higher than the current highest offer', 'MUST_EXCEED_HIGHEST');
    }
  }
}
