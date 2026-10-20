import { describe, it, expect } from 'vitest';
import {
  CREDIT_RATINGS_ORDER,
  getRatingRank,
  isRatingAtLeast,
  getRatingStatus,
  getRatingScore,
  calculateEstimatedRating,
  getRatingBadgeStyle,
} from './ratingLogic';

describe('getRatingRank', () => {
  it('returns 0 for the best rating', () => {
    expect(getRatingRank('AAA')).toBe(0);
  });

  it('returns the last index for the worst rating', () => {
    expect(getRatingRank('D')).toBe(CREDIT_RATINGS_ORDER.length - 1);
  });

  it('ranks better ratings lower than worse ratings', () => {
    expect(getRatingRank('AA')).toBeLessThan(getRatingRank('BBB'));
  });
});

describe('isRatingAtLeast', () => {
  it('passes when rating equals the default minimum (B-)', () => {
    expect(isRatingAtLeast('B-')).toBe(true);
  });

  it('passes when rating is better than the default minimum', () => {
    expect(isRatingAtLeast('AAA')).toBe(true);
  });

  it('fails when rating is worse than the default minimum', () => {
    expect(isRatingAtLeast('CCC+')).toBe(false);
  });

  it('respects a custom minimum rating', () => {
    expect(isRatingAtLeast('BBB', 'A')).toBe(false);
    expect(isRatingAtLeast('A', 'BBB')).toBe(true);
  });
});

describe('getRatingStatus', () => {
  it('returns PASS for ratings at or above the minimum', () => {
    expect(getRatingStatus('B-')).toBe('PASS');
  });

  it('returns FAIL for ratings below the minimum', () => {
    expect(getRatingStatus('CCC')).toBe('FAIL');
  });
});

describe('getRatingScore', () => {
  it('gives the top rating a score of 100', () => {
    expect(getRatingScore('AAA')).toBe(100);
  });

  it('gives the bottom rating a score of 0', () => {
    expect(getRatingScore('D')).toBe(0);
  });

  it('scores strictly decrease as rating quality decreases', () => {
    const scoreAA = getRatingScore('AA');
    const scoreBBB = getRatingScore('BBB');
    const scoreCCC = getRatingScore('CCC');
    expect(scoreAA).toBeGreaterThan(scoreBBB);
    expect(scoreBBB).toBeGreaterThan(scoreCCC);
  });
});

describe('calculateEstimatedRating', () => {
  it('returns AAA for very strong financials', () => {
    expect(calculateEstimatedRating(50, 20, 15)).toBe('AAA');
  });

  it('returns D for very weak financials', () => {
    expect(calculateEstimatedRating(1500, -20, 0.05)).toBe('D');
  });

  it('falls through to a lower tier when just missing the top threshold', () => {
    // Fails AAA's debtRatio < 60 cutoff, but still meets AA+'s thresholds.
    expect(calculateEstimatedRating(60, 20, 15)).toBe('AA+');
  });

  it('returns CCC+ once debt ratio exceeds the graded tiers but stays under 700', () => {
    expect(calculateEstimatedRating(600, -20, 0.05)).toBe('CCC+');
  });
});

describe('getRatingBadgeStyle', () => {
  it('returns a distinct emerald style for top-tier ratings', () => {
    expect(getRatingBadgeStyle('AAA')).toEqual({
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
    });
  });

  it('returns a distinct rose style for the lowest-tier ratings', () => {
    expect(getRatingBadgeStyle('D')).toEqual({
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
    });
  });
});
