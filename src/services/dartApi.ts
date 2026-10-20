import type { CompanyRawData, CompanyAnalysisResult } from '../types';
import { geocodeAddress } from '../utils/geocoding';
import { getNearestHubInfo } from '../utils/distance';
import { getRatingRank, getRatingScore } from '../utils/ratingLogic';
import { findDartCorp, findBondCreditRating } from './dartLookup';

const DART_KEY_STORAGE_KEY = 'dart_api_key';

export function getStoredDartApiKey(): string {
  return localStorage.getItem(DART_KEY_STORAGE_KEY) || '';
}

export function setStoredDartApiKey(key: string): void {
  localStorage.setItem(DART_KEY_STORAGE_KEY, key.trim());
}

export function isValidDartApiKey(key: string): boolean {
  return key.trim().length > 10;
}

/**
 * Fetch real DART credit rating and analysis for a company. Requires a valid
 * API key — this never fabricates a rating. Callers must check
 * `isValidDartApiKey` themselves before triggering analysis (so the app can
 * warn the user up front instead of discovering it mid-batch).
 */
export async function analyzeCompanyWithDart(
  company: CompanyRawData,
  apiKey: string = getStoredDartApiKey()
): Promise<CompanyAnalysisResult> {
  if (!isValidDartApiKey(apiKey)) {
    throw new Error('DART API 키가 등록되어 있지 않습니다. API 키를 먼저 등록해주세요.');
  }

  // 1. Geocode company address
  const coords = (company.lat && company.lng)
    ? { lat: company.lat, lng: company.lng }
    : geocodeAddress(company.address);

  // 2. Find nearest Hansol hub and distances
  const hubInfo = getNearestHubInfo(coords.lat, coords.lng);

  // Updated company with coords
  const updatedCompany: CompanyRawData = {
    ...company,
    lat: coords.lat,
    lng: coords.lng
  };

  const baseResult = {
    id: company.id,
    nearestHub: hubInfo.nearestHub,
    distanceKm: hubInfo.distanceKm,
    allHubDistances: hubInfo.allHubDistances,
    lastUpdated: new Date().toISOString().split('T')[0]
  };

  // 4. Confirm the company is actually registered on DART under this exact
  // business registration number. No match means no rating is fabricated.
  if (!company.bizNo) {
    return {
      ...baseResult,
      company: updatedCompany,
      creditRating: null,
      ratingScore: 0,
      ratingStatus: 'FAIL',
      dartSource: 'NOT_ON_DART',
      phoneVerified: false
    };
  }

  const dartCorp = await findDartCorp(company.name, company.bizNo, apiKey).catch(() => null);
  if (!dartCorp) {
    return {
      ...baseResult,
      company: updatedCompany,
      creditRating: null,
      ratingScore: 0,
      ratingStatus: 'FAIL',
      dartSource: 'NOT_ON_DART',
      phoneVerified: false
    };
  }

  // Only a non-empty phone number actually supplied by DART counts as
  // verified — a company can be matched on DART yet have no phn_no on file,
  // in which case the uploaded value (if any) is kept but stays unverified.
  const phoneVerified = Boolean(dartCorp.phoneNo);
  const confirmedCompany: CompanyRawData = {
    ...updatedCompany,
    corpCode: dartCorp.corpCode,
    address: dartCorp.adres || updatedCompany.address,
    phone: dartCorp.phoneNo || updatedCompany.phone
  };

  // 5. Look for a stated credit rating in the company's 채무증권(사채)
  // 증권신고서 filings. If none is found, the rating stays unconfirmed.
  const bondRating = await findBondCreditRating(dartCorp.corpCode, apiKey).catch(() => null);
  if (!bondRating) {
    return {
      ...baseResult,
      company: confirmedCompany,
      creditRating: null,
      ratingScore: 0,
      ratingStatus: 'FAIL',
      dartSource: 'ON_DART_NO_RATING',
      phoneVerified
    };
  }

  return {
    ...baseResult,
    company: confirmedCompany,
    creditRating: bondRating.rating,
    ratingScore: getRatingScore(bondRating.rating),
    ratingStatus: getRatingRank(bondRating.rating) <= getRatingRank('B-') ? 'PASS' : 'FAIL',
    dartSource: 'LIVE_DART',
    ratingSource: {
      agency: bondRating.agency,
      rceptNo: bondRating.rceptNo,
      reportDate: bondRating.reportDate
    },
    phoneVerified
  };
}
