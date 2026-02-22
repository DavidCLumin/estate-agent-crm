import { describe, expect, it } from 'vitest';
import { applyOptimisticBid, getClientBidValidationError } from '../src/lib/bidRules';

describe('mobile bid rules', () => {
  it('requires bids to beat current highest bid', () => {
    expect(getClientBidValidationError({ amount: 700000, highestBid: 700000 })).toContain('higher');
    expect(getClientBidValidationError({ amount: 700001, highestBid: 700000 })).toBeNull();
  });

  it('allows first bid when there is no highest bid yet', () => {
    expect(getClientBidValidationError({ amount: 700000, highestBid: null })).toBeNull();
  });

  it('applies optimistic bid updates immediately', () => {
    const next = applyOptimisticBid({
      amount: 710000,
      highestBid: 700000,
      ownBids: [{ amount: 700000, createdAt: '2026-02-20T18:00:00.000Z' }],
      bidHistory: [{ amount: 700000, createdAt: '2026-02-20T18:00:00.000Z', bidder: 'Bidder A' }],
      createdAtIso: '2026-02-20T18:01:00.000Z',
    });

    expect(next.highestBid).toBe(710000);
    expect(next.ownBids[0].amount).toBe(710000);
    expect(next.bidHistory[0].bidder).toBe('You');
  });
});

