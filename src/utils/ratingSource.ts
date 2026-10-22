import type { RatingSource } from '../types';

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
