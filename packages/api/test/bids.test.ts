import { describe, expect, it } from 'vitest';
import { validateBidSubmission } from '../src/modules/bids/rules';

describe('validateBidSubmission', () => {
  it('requires open bid to be higher than current highest', () => {
    expect(() =>
      validateBidSubmission({
        property: { biddingMode: 'OPEN', biddingDeadline: null, minimumOffer: null as any },
        latestBid: { amount: 500000 as any },
        amount: 500000,
        now: new Date(),
      }),
    ).toThrow();
  });

  it('enforces minimum offer for first bid', () => {
    expect(() =>
      validateBidSubmission({
        property: { biddingMode: 'SEALED', biddingDeadline: null, minimumOffer: 400000 as any },
        latestBid: null,
        amount: 399999,
        now: new Date(),
      }),
    ).toThrow();
  });

  it('rejects first OPEN bid below hidden minimum offer', () => {
    expect(() =>
      validateBidSubmission({
        property: { biddingMode: 'OPEN', biddingDeadline: null, minimumOffer: 700000 as any },
        latestBid: null,
        amount: 699999,
        now: new Date(),
      }),
    ).toThrow();
  });

  it('allows below asking style offer when above minimum and no bids yet', () => {
    expect(() =>
      validateBidSubmission({
        property: { biddingMode: 'OPEN', biddingDeadline: null, minimumOffer: 600000 as any },
        latestBid: null,
        amount: 700000,
        now: new Date(),
      }),
    ).not.toThrow();
  });
});
