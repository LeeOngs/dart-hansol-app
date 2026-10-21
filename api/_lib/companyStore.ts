import { Redis } from '@upstash/redis';
import type { CompanyAnalysisResult, StoredCompanyResult, UploadBatch } from '../../src/types.js';
import { companyKey, defaultUploadLabel, nextUploadId, toStored } from '../../src/services/companyStore.js';

// Lazy so importing this module (e.g. from the bulk script before env vars
// are checked) doesn't throw.
let client: Redis | null = null;
function redis(): Redis {
  client ??= Redis.fromEnv();
  return client;
}

// One cumulative company list per dataset year: hash of companyKey →
// StoredCompanyResult under "dart_companies:<year>".
function companiesKey(year: string): string {
  return `dart_companies:${year}`;
}
// Upload log across all years, newest first. Small (counts only), so a single JSON value.
const UPLOADS_KEY = 'dart_uploads';

const SCAN_PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 500;

export async function loadUploads(): Promise<UploadBatch[]> {
  const data = await redis().get<UploadBatch[]>(UPLOADS_KEY);
  return Array.isArray(data) ? data : [];
}

/** One page of a year's company list. Pass '0' to start; a returned '0' means done. */
export async function loadCompaniesPage(year: string, cursor: string): Promise<{ companies: StoredCompanyResult[]; cursor: string }> {
  const [nextCursor, flat] = await redis().hscan(companiesKey(year), cursor, { count: SCAN_PAGE_SIZE });
  const companies: StoredCompanyResult[] = [];
  for (let i = 1; i < flat.length; i += 2) {
    const value = flat[i];
    companies.push((typeof value === 'string' ? JSON.parse(value) : value) as StoredCompanyResult);
  }
  return { companies, cursor: String(nextCursor) };
}

export async function loadCompanyKeys(year: string): Promise<Set<string>> {
  return new Set(await redis().hkeys(companiesKey(year)));
}

/**
 * Records one upload into a year's list: adds each result under its
 * companyKey only if that key isn't already in that year (HSETNX — existing
 * companies are never overwritten), then logs the batch with how many were
 * actually added.
 */
export async function saveUpload(params: {
  year: string;
  label?: string;
  results: CompanyAnalysisResult[];
  skippedCount: number;
  failedCount: number;
}): Promise<{ upload: UploadBatch; added: StoredCompanyResult[] }> {
  const uploads = await loadUploads();
  const id = nextUploadId(uploads);

  const added: StoredCompanyResult[] = [];
  let alreadyPresent = 0;
  for (let i = 0; i < params.results.length; i += WRITE_CHUNK_SIZE) {
    const chunk = params.results.slice(i, i + WRITE_CHUNK_SIZE).map((r) => toStored(r, id));
    const pipeline = redis().pipeline();
    for (const stored of chunk) pipeline.hsetnx(companiesKey(params.year), companyKey(stored.company), stored);
    const outcomes = await pipeline.exec<number[]>();
    outcomes.forEach((wasSet, j) => {
      if (wasSet === 1) added.push(chunk[j]);
      else alreadyPresent++;
    });
  }

  const upload: UploadBatch = {
    id,
    year: params.year,
    label: params.label?.trim() || defaultUploadLabel(),
    createdAt: new Date().toISOString(),
    addedCount: added.length,
    skippedCount: params.skippedCount + alreadyPresent,
    failedCount: params.failedCount
  };
  await redis().set(UPLOADS_KEY, [upload, ...uploads]);
  return { upload, added };
}
