import { describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../src/lib/security';

describe('refresh token rotation hash', () => {
  it('hashes deterministically', () => {
    const token = 'abc123';
    expect(hashRefreshToken(token)).toEqual(hashRefreshToken(token));
  });

  it('changes for different tokens', () => {
    expect(hashRefreshToken('a')).not.toEqual(hashRefreshToken('b'));
  });
});
