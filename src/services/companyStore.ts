import type { CompanyAnalysisResult, CompanyRawData, StoredCompanyResult, UploadBatch } from '../types.js';
import { normalizeBizNo } from '../utils/bizNo.js';
import { getNearestHubInfo } from '../utils/distance.js';

// Pure helpers shared by the browser, the Vercel API (api/_lib/companyStore.ts)
// and the local bulk script — so all three agree on identity and ids.

/**
 * Identity of a company in the shared list: its business registration number,
 * or its name when none was given. Prefixed so the key is never all digits —
 * the Redis client would otherwise parse it back as a number.
 */
export function companyKey(company: Pick<CompanyRawData, 'name' | 'bizNo'>): string {
  const bizNo = normalizeBizNo(company.bizNo ?? '');
  return bizNo ? `biz:${bizNo}` : `name:${company.name.trim()}`;
}

/** Drops repeated rows (same companyKey) within one upload, keeping the first. */
export function dedupeCompanies(companies: CompanyRawData[]): CompanyRawData[] {
  const seen = new Set<string>();
  return companies.filter((c) => {
    const key = companyKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Each dataset year is a separate cumulative list: a new year starts empty,
// so every company in it is looked up fresh against DART for that year.
export function isValidDatasetYear(year: unknown): year is string {
  return typeof year === 'string' && /^20\d{2}$/.test(year);
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}

/** Years that have at least one upload, newest first. */
export function yearsFromUploads(uploads: UploadBatch[]): string[] {
  return [...new Set(uploads.map((u) => u.year))].sort((a, b) => b.localeCompare(a));
}

function todayDatePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Next "YYYYMMDD-NNN" id, continuing today's sequence from existing batches. */
export function nextUploadId(existing: UploadBatch[]): string {
  const prefix = todayDatePrefix();
  const todaysSeqs = existing
    .filter((b) => b.id.startsWith(`${prefix}-`))
    .map((b) => parseInt(b.id.slice(prefix.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  const nextSeq = (todaysSeqs.length > 0 ? Math.max(...todaysSeqs) : 0) + 1;
  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

export function defaultUploadLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `업로드 ${y}-${m}-${d}`;
}

export function toStored(result: CompanyAnalysisResult, uploadId: string): StoredCompanyResult {
  const { nearestHub: _nearestHub, distanceKm: _distanceKm, allHubDistances: _allHubDistances, ...rest } = result;
  return { ...rest, uploadId };
}

export function hydrate(stored: StoredCompanyResult): CompanyAnalysisResult {
  const { lat, lng } = stored.company;
  if (lat === undefined || lng === undefined) {
    throw new Error(`좌표 없는 저장 데이터: ${stored.company.name}`);
  }
  return { ...stored, ...getNearestHubInfo(lat, lng) };
}
