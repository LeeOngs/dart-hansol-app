export type CreditRating = 
  | 'AAA' | 'AA+' | 'AA' | 'AA-' 
  | 'A+' | 'A' | 'A-' 
  | 'BBB+' | 'BBB' | 'BBB-' 
  | 'BB+' | 'BB' | 'BB-' 
  | 'B+' | 'B' | 'B-' 
  | 'CCC+' | 'CCC' | 'CC' | 'C' | 'D';

export type RatingStatus = 'PASS' | 'FAIL'; // PASS if rating >= B-

export interface HansolHub {
  id: string;
  name: string;
  type: 'CY' | 'ICD';
  address: string;
  lat: number;
  lng: number;
  area: string;
  capacity: string;
  advantage: string;
  phone: string;
  color: string;
}

export interface CompanyRawData {
  id: string;
  name: string;
  bizNo?: string;
  corpCode?: string;
  address: string;
  phone?: string;
  industry?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

export interface HubDistance {
  hub: HansolHub;
  distanceKm: number;
  estimatedDriveTimeMin: number;
}

export interface RatingSource {
  agency: string;
  rceptNo: string;
  reportDate: string;
}

export interface CompanyAnalysisResult {
  id: string;
  company: CompanyRawData;
  creditRating: CreditRating | null; // null when no real rating could be confirmed
  ratingScore: number; // 0-100 score for sorting; 0 when creditRating is null
  ratingStatus: RatingStatus;
  debtRatio?: number; // %
  operatingMargin?: number; // %
  interestCoverage?: number;
  revenue?: number; // 억원
  operatingIncome?: number; // 억원
  nearestHub: HansolHub;
  distanceKm: number;
  allHubDistances: HubDistance[];
  dartSource: 'LIVE_DART' | 'NOT_ON_DART' | 'ON_DART_NO_RATING';
  ratingSource?: RatingSource;
  // True only when DART's own company record actually supplied the phone
  // number (i.e. it was replaced, not just left as whatever was uploaded).
  phoneVerified?: boolean;
  lastUpdated: string;
  uploadId?: string; // the upload batch that first added this company
}

export type SortField = 'nearestHub' | 'distanceKm' | 'creditRating' | 'name';
export type SortOrder = 'asc' | 'desc';

// Server-persisted form of a result. Hub distances are pure functions of
// lat/lng, so they're recomputed on load instead of stored — that keeps
// thousands of rows small enough for one shared store.
export type StoredCompanyResult = Omit<CompanyAnalysisResult, 'nearestHub' | 'distanceKm' | 'allHubDistances'> & {
  uploadId: string;
};

// One upload batch. Each dataset year (e.g. "2026") has its own cumulative
// company list; a batch records which year it went into, which upload first
// added each company, and what it skipped.
export interface UploadBatch {
  id: string; // e.g. "20260916-001" — YYYYMMDD + daily sequence
  year: string; // dataset year, e.g. "2026" — chosen by the admin, not the upload date
  label: string; // e.g. "2025년 업체 리스트"
  createdAt: string; // ISO timestamp
  addedCount: number;
  skippedCount: number; // already in the shared list — not re-queried
  failedCount: number; // lookup errored; not saved, retried on a later upload
}
