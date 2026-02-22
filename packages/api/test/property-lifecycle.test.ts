import { describe, expect, it } from 'vitest';
import { validatePropertyStatusTransition } from '../src/modules/properties/rules';

describe('validatePropertyStatusTransition', () => {
  it('allows LIVE -> UNDER_OFFER -> SOLD workflow transitions', () => {
    expect(() => validatePropertyStatusTransition('LIVE', 'UNDER_OFFER')).not.toThrow();
    expect(() => validatePropertyStatusTransition('UNDER_OFFER', 'SOLD')).not.toThrow();
  });

  it('rejects invalid lifecycle transitions', () => {
    expect(() => validatePropertyStatusTransition('DRAFT', 'SOLD')).toThrow();
    expect(() => validatePropertyStatusTransition('SOLD', 'LIVE')).toThrow();
  });
});

