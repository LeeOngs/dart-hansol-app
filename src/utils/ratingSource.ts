import type { CompanyAnalysisResult, RatingSource } from '../types';

function formatYyyyMmDd(date: string): string {
  return date.length === 8 ? `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6)}` : date;
}

/** When the rating is from — the rating date for annual reports, else the filing date. */
export function ratingBasisDate(source: RatingSource | undefined): string {
  if (!source) return '';
  return source.kind === 'ANNUAL_REPORT' && source.evaluatedAt
    ? source.evaluatedAt.replace(/-/g, '.')
    : formatYyyyMmDd(source.reportDate);
}

/** e.g. "사업보고서 · 2025.06.30 정기평가 · NICE신용평가" */
export function describeRatingSource(source: RatingSource | undefined): string {
  if (!source) return '';
  const document = source.kind === 'ANNUAL_REPORT' ? '사업보고서' : '채무증권 신고서';
  const when = [ratingBasisDate(source), source.evaluationType].filter(Boolean).join(' ');
  return `${document} · ${when} · ${source.agency}`;
}

// A rating dated two or more calendar years back (in 2026: 2024 or earlier)
// isn't a current rating. Mostly these come from old bond filings, used when
// the annual report has no rating table; see the admin guide.
const STALE_AFTER_YEARS = 2;

/** The rating's year when it is old enough to flag, else null. */
export function staleRatingYear(source: RatingSource | undefined, now = new Date()): number | null {
  const year = Number(ratingBasisDate(source).slice(0, 4));
  if (!year) return null;
  return now.getFullYear() - year >= STALE_AFTER_YEARS ? year : null;
}

/** "A+", or "B(2010)" for an old rating; "미확인" when there is none. */
export function formatRating(item: Pick<CompanyAnalysisResult, 'creditRating' | 'ratingSource'>, now = new Date()): string {
  if (!item.creditRating) return '미확인';
  const year = staleRatingYear(item.ratingSource, now);
  return year ? `${item.creditRating}(${year})` : item.creditRating;
}
