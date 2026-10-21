import type { CreditRating, RatingStatus } from '../types.js';

export const CREDIT_RATINGS_ORDER: CreditRating[] = [
  'AAA',
  'AA+', 'AA', 'AA-',
  'A+', 'A', 'A-',
  'BBB+', 'BBB', 'BBB-',
  'BB+', 'BB', 'BB-',
  'B+', 'B', 'B-',
  'CCC+', 'CCC', 'CC', 'C', 'D'
];

export function getRatingRank(rating: CreditRating): number {
  const index = CREDIT_RATINGS_ORDER.indexOf(rating);
  return index !== -1 ? index : 999;
}

export function isRatingAtLeast(rating: CreditRating, minRating: CreditRating = 'B-'): boolean {
  const ratingRank = getRatingRank(rating);
  const minRank = getRatingRank(minRating);
  return ratingRank <= minRank;
}

export function getRatingStatus(rating: CreditRating, minRating: CreditRating = 'B-'): RatingStatus {
  return isRatingAtLeast(rating, minRating) ? 'PASS' : 'FAIL';
}

export function getRatingScore(rating: CreditRating): number {
  const rank = getRatingRank(rating);
  const total = CREDIT_RATINGS_ORDER.length;
  if (rank === 999) return 0;
  return Math.round(100 - (rank / (total - 1)) * 100);
}

export function calculateEstimatedRating(debtRatio: number, operatingMargin: number, interestCoverage: number): CreditRating {
  if (debtRatio < 60 && operatingMargin > 15 && interestCoverage > 10) return 'AAA';
  if (debtRatio < 90 && operatingMargin > 12 && interestCoverage > 7) return 'AA+';
  if (debtRatio < 110 && operatingMargin > 10 && interestCoverage > 5) return 'AA';
  if (debtRatio < 130 && operatingMargin > 8 && interestCoverage > 4) return 'A+';
  if (debtRatio < 150 && operatingMargin > 6 && interestCoverage > 3) return 'A';
  if (debtRatio < 180 && operatingMargin > 4 && interestCoverage > 2.5) return 'BBB+';
  if (debtRatio < 200 && operatingMargin > 3 && interestCoverage > 2.0) return 'BBB';
  if (debtRatio < 230 && operatingMargin > 2 && interestCoverage > 1.5) return 'BBB-';
  if (debtRatio < 270 && operatingMargin > 1 && interestCoverage > 1.2) return 'BB+';
  if (debtRatio < 300 && operatingMargin > 0 && interestCoverage > 1.0) return 'BB';
  if (debtRatio < 350 && operatingMargin > -2 && interestCoverage > 0.8) return 'B+';
  if (debtRatio < 400 && operatingMargin > -5 && interestCoverage > 0.5) return 'B';
  if (debtRatio < 500 && operatingMargin > -10 && interestCoverage > 0.2) return 'B-';
  if (debtRatio < 700) return 'CCC+';
  if (debtRatio < 1000) return 'CCC';
  return 'D';
}

export function getRatingBadgeStyle(rating: CreditRating): { bg: string; text: string; border: string } {
  const rank = getRatingRank(rating);
  
  if (rank <= 3) {
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  } else if (rank <= 6) {
    return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' };
  } else if (rank <= 9) {
    return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' };
  } else if (rank <= 12) {
    return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' };
  } else if (rank <= 15) {
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
  } else {
    return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' };
  }
}
