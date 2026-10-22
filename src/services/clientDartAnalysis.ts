import type { CompanyRawData, CompanyAnalysisResult } from '../types';
import { analyzeCompany, runPool } from './companyAnalysis';
import type { DartBackend, DartCorpMatch, BondFiling, BondRatingFound, AnnualRatingFound } from './companyAnalysis';

export interface AnalysisProgress {
  doneCount: number;
  total: number;
  currentName: string;
  step: string;
}

export interface FailedCompany {
  company: CompanyRawData;
  error: string;
}

type HttpError = Error & { status?: number };

// Each lookup step is its own small server call (corp match → filing list →
// one filing per call) rather than one long request: DART throttles document
// downloads from overseas IPs to ~14KB/s, so a single filing check can take
// tens of seconds — several inside one request would exceed Vercel's limit.
const CONCURRENCY = 3;

async function postJsonOnce<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: HttpError = new Error(data.error || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// One transient failure (network blip, function timeout) shouldn't fail the
// company outright. Auth/validation errors (4xx) are not retried.
async function postJson<T>(url: string, body: unknown, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await postJsonOnce<T>(url, body);
    } catch (err) {
      lastError = err;
      const status = (err as HttpError).status;
      if (status && status >= 400 && status < 500) throw err;
    }
  }
  throw lastError;
}

function httpBackend(adminPassword: string): DartBackend {
  return {
    findCorp: async (name, bizNo) =>
      (await postJson<{ dartCorp: DartCorpMatch | null }>('/api/dart/find-corp', { adminPassword, name, bizNo })).dartCorp,
    annualReportRating: async (corpCode) =>
      (await postJson<{ found: AnnualRatingFound | null }>('/api/dart/annual-rating', { adminPassword, corpCode })).found,
    listBondFilings: async (corpCode) =>
      (await postJson<{ filings: BondFiling[] }>('/api/dart/list-bond-filings', { adminPassword, corpCode })).filings,
    checkFiling: async (rceptNo) =>
      (await postJson<{ found: BondRatingFound | null }>('/api/dart/check-filing', { adminPassword, rceptNo })).found
  };
}

/**
 * Analyzes companies a few at a time. A company whose lookup fails is
 * reported in `failed` (not saved, so a later upload retries it) instead of
 * aborting the whole run — except auth failures (401), which abort.
 */
export async function analyzeCompanies(
  companies: CompanyRawData[],
  adminPassword: string,
  onProgress: (p: AnalysisProgress) => void
): Promise<{ results: CompanyAnalysisResult[]; failed: FailedCompany[] }> {
  const backend = httpBackend(adminPassword);
  const results: CompanyAnalysisResult[] = [];
  const failed: FailedCompany[] = [];
  let doneCount = 0;
  let authError: HttpError | null = null;

  await runPool(companies, CONCURRENCY, async (company) => {
    const report = (step: string) => onProgress({ doneCount, total: companies.length, currentName: company.name, step });
    try {
      results.push(await analyzeCompany(company, backend, report));
    } catch (err) {
      if ((err as HttpError).status === 401) {
        authError = err as HttpError;
        return;
      }
      failed.push({ company, error: (err as Error).message });
    }
    doneCount++;
    report('완료');
  }, () => authError !== null);

  if (authError) throw authError;
  return { results, failed };
}
