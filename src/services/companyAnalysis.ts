import type { CompanyRawData, CompanyAnalysisResult, CreditRating } from '../types.js';
import { geocodeAddress } from '../utils/geocoding.js';
import { getNearestHubInfo } from '../utils/distance.js';
import { getRatingRank, getRatingScore } from '../utils/ratingLogic.js';

export interface DartCorpMatch {
  corpCode: string;
  bizrNo: string;
  adres: string;
  ceoNm: string;
  phoneNo: string;
}

export interface BondFiling {
  rceptNo: string;
  reportName: string;
  reportDate: string;
}

export interface BondRatingFound {
  rating: CreditRating;
  agency: string;
}

/**
 * The three DART lookups an analysis needs. The browser implements these as
 * calls to the admin-gated /api/dart/* functions; the local bulk script calls
 * DART directly. Implementations must throw on failure — returning null/[] on
 * an error would be recorded as a false "not on DART" / "no rating".
 */
export interface DartBackend {
  findCorp(name: string, bizNo: string): Promise<DartCorpMatch | null>;
  listBondFilings(corpCode: string): Promise<BondFiling[]>;
  checkFiling(rceptNo: string): Promise<BondRatingFound | null>;
}

/**
 * Analyzes one company: exact bizr_no match on DART, then the rating stated in
 * its most recent 채무증권 증권신고서 filings. Never guesses — a company that
 * can't be confirmed is recorded as NOT_ON_DART or ON_DART_NO_RATING.
 */
export async function analyzeCompany(
  company: CompanyRawData,
  backend: DartBackend,
  report: (step: string) => void = () => {}
): Promise<CompanyAnalysisResult> {
  const coords = company.lat && company.lng
    ? { lat: company.lat, lng: company.lng }
    : geocodeAddress(company.address);
  const hubInfo = getNearestHubInfo(coords.lat, coords.lng);
  const updatedCompany: CompanyRawData = { ...company, lat: coords.lat, lng: coords.lng };
  const base = {
    id: company.id,
    nearestHub: hubInfo.nearestHub,
    distanceKm: hubInfo.distanceKm,
    allHubDistances: hubInfo.allHubDistances,
    lastUpdated: new Date().toISOString().split('T')[0]
  };
  const notOnDart: CompanyAnalysisResult = {
    ...base,
    company: updatedCompany,
    creditRating: null,
    ratingScore: 0,
    ratingStatus: 'FAIL',
    dartSource: 'NOT_ON_DART',
    phoneVerified: false
  };

  if (!company.bizNo) return notOnDart;

  report('DART 등록 여부 확인 중');
  const dartCorp = await backend.findCorp(company.name, company.bizNo);
  if (!dartCorp) return notOnDart;

  const phoneVerified = Boolean(dartCorp.phoneNo);
  const confirmedCompany: CompanyRawData = {
    ...updatedCompany,
    corpCode: dartCorp.corpCode,
    address: dartCorp.adres || updatedCompany.address,
    phone: dartCorp.phoneNo || updatedCompany.phone
  };

  report('채무증권 신고서 목록 조회 중');
  const filings = await backend.listBondFilings(dartCorp.corpCode);

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    report(`신용등급 확인 중 (공시 ${i + 1}/${filings.length})`);
    const found = await backend.checkFiling(filing.rceptNo);
    if (found) {
      return {
        ...base,
        company: confirmedCompany,
        creditRating: found.rating,
        ratingScore: getRatingScore(found.rating),
        ratingStatus: getRatingRank(found.rating) <= getRatingRank('B-') ? 'PASS' : 'FAIL',
        dartSource: 'LIVE_DART',
        ratingSource: { agency: found.agency, rceptNo: filing.rceptNo, reportDate: filing.reportDate },
        phoneVerified
      };
    }
  }

  return {
    ...base,
    company: confirmedCompany,
    creditRating: null,
    ratingScore: 0,
    ratingStatus: 'FAIL',
    dartSource: 'ON_DART_NO_RATING',
    phoneVerified
  };
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight. Stops
 * starting new items once `shouldStop()` returns true.
 */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length && !shouldStop()) {
      const index = next++;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}
