import { describe, it, expect } from 'vitest';
import { companyKey, dedupeCompanies, nextUploadId, toStored, hydrate, isValidDatasetYear, yearsFromUploads } from './companyStore';
import { getNearestHubInfo } from '../utils/distance';
import type { CompanyAnalysisResult, UploadBatch } from '../types';

function batch(id: string, year = '2026'): UploadBatch {
  return { id, year, label: id, createdAt: '', addedCount: 0, skippedCount: 0, failedCount: 0 };
}

describe('dataset years', () => {
  it('accepts only 4-digit 20xx years', () => {
    expect(isValidDatasetYear('2025')).toBe(true);
    expect(isValidDatasetYear('25')).toBe(false);
    expect(isValidDatasetYear('2025; DROP')).toBe(false);
    expect(isValidDatasetYear(2025)).toBe(false);
  });

  it('lists each year that has uploads once, newest first', () => {
    const uploads = [batch('a', '2025'), batch('b', '2027'), batch('c', '2025'), batch('d', '2026')];
    expect(yearsFromUploads(uploads)).toEqual(['2027', '2026', '2025']);
  });
});

describe('companyKey', () => {
  it('identifies a company by its business number regardless of formatting', () => {
    expect(companyKey({ name: 'A', bizNo: '123-81-45678' })).toBe(companyKey({ name: 'B', bizNo: '1238145678' }));
  });

  it('never produces an all-digit key (the Redis client would parse it as a number)', () => {
    expect(companyKey({ name: 'A', bizNo: '1238145678' })).not.toMatch(/^\d+$/);
  });

  it('falls back to the name when there is no business number', () => {
    expect(companyKey({ name: ' 한솔물류 ', bizNo: undefined })).toBe('name:한솔물류');
    expect(companyKey({ name: '한솔물류', bizNo: '' })).toBe('name:한솔물류');
  });
});

describe('dedupeCompanies', () => {
  it('keeps the first row of each repeated business number', () => {
    const rows = [
      { id: '1', name: '첫째', address: '', bizNo: '123-81-45678' },
      { id: '2', name: '둘째', address: '', bizNo: '1238145678' },
      { id: '3', name: '셋째', address: '', bizNo: '2228100000' }
    ];
    expect(dedupeCompanies(rows).map((r) => r.id)).toEqual(['1', '3']);
  });
});

describe('nextUploadId', () => {
  it('starts at 001 for a day with no uploads', () => {
    expect(nextUploadId([])).toMatch(/^\d{8}-001$/);
  });

  it("continues today's sequence and ignores other dates", () => {
    const prefix = nextUploadId([]).split('-')[0];
    expect(nextUploadId([batch(`${prefix}-002`), batch(`${prefix}-001`), batch('19990101-999')])).toBe(`${prefix}-003`);
  });
});

describe('toStored / hydrate', () => {
  it('drops hub distances for storage and recomputes the same values on load', () => {
    const hubInfo = getNearestHubInfo(36.79, 127.0);
    const result: CompanyAnalysisResult = {
      id: 'x',
      company: { id: 'x', name: '테스트', address: '충남 아산시', lat: 36.79, lng: 127.0 },
      creditRating: 'A+',
      ratingScore: 90,
      ratingStatus: 'PASS',
      dartSource: 'LIVE_DART',
      lastUpdated: '2026-10-21',
      ...hubInfo
    };

    const stored = toStored(result, '20261021-001');
    expect(stored).not.toHaveProperty('allHubDistances');
    expect(stored).not.toHaveProperty('nearestHub');
    expect(hydrate(stored)).toEqual({ ...result, uploadId: '20261021-001' });
  });
});
