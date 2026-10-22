import type { CompanyRawData, CompanyAnalysisResult, CreditRating, RatingSource } from '../types.js';
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

export interface AnnualRatingFound extends BondRatingFound {
  evaluatedAt: string; // YYYY-MM-DD
  evaluationType: string;
  report: { rceptNo: string; reportDate: string };
}

/**
 * The DART lookups an analysis needs. The browser implements these as calls
 * to the admin-gated /api/dart/* functions; the local bulk script calls DART
 * directly. Implementations must throw on failure — returning null/[] on an
 * error would be recorded as a false "not on DART" / "no rating". The one
 * exception: `annualReportRating` may return null when the report couldn't be
 * downloaded in time, because the bond filings are then checked instead.
 */
export interface DartBackend {
  findCorp(name: string, bizNo: string): Promise<DartCorpMatch | null>;
  annualReportRating(corpCode: string): Promise<AnnualRatingFound | null>;
  listBondFilings(corpCode: string): Promise<BondFiling[]>;
  checkFiling(rceptNo: string): Promise<BondRatingFound | null>;
}

/**
 * Analyzes one company: exact bizr_no match on DART, then its credit rating —
 * first from the latest 사업보고서's rating table (which includes yearly
 * surveillance ratings, so it's current), else from its most recent
 * 채무증권 증권신고서 filings. Never guesses — a company that can't be
 * confirmed is recorded as NOT_ON_DART or ON_DART_NO_RATING.
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

  const rated = (rating: CreditRating, ratingSource: RatingSource): CompanyAnalysisResult => ({
    ...base,
    company: confirmedCompany,
    creditRating: rating,
    ratingScore: getRatingScore(rating),
    ratingStatus: getRatingRank(rating) <= getRatingRank('B-') ? 'PASS' : 'FAIL',
    dartSource: 'LIVE_DART',
    ratingSource,
    phoneVerified
  });

  report('사업보고서 신용등급 확인 중');
  const annual = await backend.annualReportRating(dartCorp.corpCode);
  if (annual) {
    return rated(annual.rating, {
      kind: 'ANNUAL_REPORT',
      agency: annual.agency,
      rceptNo: annual.report.rceptNo,
      reportDate: annual.report.reportDate,
      evaluatedAt: annual.evaluatedAt,
      evaluationType: annual.evaluationType
    });
  }

  report('채무증권 신고서 목록 조회 중');
  const filings = await backend.listBondFilings(dartCorp.corpCode);

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    report(`신용등급 확인 중 (공시 ${i + 1}/${filings.length})`);
    const found = await backend.checkFiling(filing.rceptNo);
    if (found) {
      return rated(found.rating, { kind: 'BOND_FILING', agency: found.agency, rceptNo: filing.rceptNo, reportDate: filing.reportDate });
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
