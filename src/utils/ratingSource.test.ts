import { describe, it, expect } from 'vitest';
import { formatRating, staleRatingYear } from './ratingSource';
import type { RatingSource } from '../types';

const NOW = new Date('2026-10-22');
const annual = (evaluatedAt: string): RatingSource => ({ kind: 'ANNUAL_REPORT', agency: 'NICE신용평가', rceptNo: 'x', reportDate: '20260318', evaluatedAt });
const bond = (reportDate: string): RatingSource => ({ kind: 'BOND_FILING', agency: '한국신용평가', rceptNo: 'x', reportDate });

describe('formatRating', () => {
  it('shows just the rating when it is recent', () => {
    expect(formatRating({ creditRating: 'A+', ratingSource: annual('2025-06-30') }, NOW)).toBe('A+');
    expect(formatRating({ creditRating: 'AA', ratingSource: bond('20250211') }, NOW)).toBe('AA');
  });

  it('adds the year when the rating is two or more years old', () => {
    expect(formatRating({ creditRating: 'B', ratingSource: bond('20100208') }, NOW)).toBe('B(2010)');
    expect(formatRating({ creditRating: 'A', ratingSource: annual('2011-05-11') }, NOW)).toBe('A(2011)');
    expect(staleRatingYear(annual('2024-12-31'), NOW)).toBe(2024);
    expect(staleRatingYear(annual('2025-01-01'), NOW)).toBeNull();
  });

  it('shows 미확인 when there is no rating', () => {
    expect(formatRating({ creditRating: null }, NOW)).toBe('미확인');
  });
});
