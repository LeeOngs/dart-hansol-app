import { unzipSync } from 'fflate';
import type { CreditRating } from '../../src/types.js';
import { CREDIT_RATINGS_ORDER } from '../../src/utils/ratingLogic.js';
import { normalizeBizNo } from '../../src/utils/bizNo.js';
import corpCodeIndexData from './corpCodeIndex.json' with { type: 'json' };

// Server-side: calls DART directly (server-to-server, no CORS concern) —
// unlike the old client-side version, there is no dev-proxy prefix here.
const DART_PROXY_BASE = 'https://opendart.fss.or.kr/api';

interface CorpCodeEntry {
  corpCode: string;
  corpName: string;
  stockCode: string;
}

interface DartCorpMatch {
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

interface BondRatingFound {
  rating: CreditRating;
  agency: string;
}

// Korean rating agencies (한국신용평가/NICE신용평가/한국기업평가 etc.) write the
// middle sub-grade of AA/A/BBB/BB/B/CCC as "AA0"/"A0"/"BBB0"/... instead of the
// plain letter — e.g. "A+(부정적), A0(안정적)". These need to be recognized and
// mapped back to the plain-letter CreditRating, or that (very common) mid-grade
// rating is simply never matched.
const ZERO_SUFFIX_TIERS = ['AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
const ZERO_SUFFIX_TOKENS = ZERO_SUFFIX_TIERS.map((t) => `${t}0`);

// Longest tokens first so e.g. "AA+" is matched before "AA" would short-circuit,
// and "BBB0" before "BBB". \b doesn't work as a trailing boundary here because
// tokens like "AA+"/"BBB-" end in a non-word character, so a plain \b after them
// fails against the (also non-word) space/paren/slash that follows in real
// filings. Use an explicit lookaround against letters/digits instead.
const ALL_RATING_TOKENS = [...CREDIT_RATINGS_ORDER, ...ZERO_SUFFIX_TOKENS];
const RATING_TOKEN_PATTERN = new RegExp(
  `(?<![A-Za-z0-9])(${[...ALL_RATING_TOKENS].sort((a, b) => b.length - a.length).map((r) => r.replace('+', '\\+')).join('|')})(?![A-Za-z0-9])`
);

function normalizeRatingToken(token: string): CreditRating {
  return (ZERO_SUFFIX_TOKENS.includes(token) ? token.slice(0, -1) : token) as CreditRating;
}

const RATING_AGENCY_NAMES = ['한국신용평가', 'NICE신용평가', '나이스신용평가', '한국기업평가'];

// Bond filings also mention rating agencies in narrative risk-disclosure text
// (e.g. "신용등급이 AAA에서 AA+로 하향 조정되었습니다"), which can contain a stale
// or historical rating. Only the "신용등급(신용평가기관)" summary-table label is
// treated as reliable enough to extract from.
const TABLE_LABEL = '신용평가기관';

const NAME_NOISE_PATTERN = /\(주\)|주식회사|\(유\)|\(농\)|\(재\)|\(사\)|\s/g;

function normalizeCompanyName(name: string): string {
  return name.replace(NAME_NOISE_PATTERN, '');
}

// DART throttles its bulk corpCode.xml download to ~14KB/s from cloud/
// datacenter IPs (confirmed empirically — a 3.6MB file took 4+ minutes from
// Vercel, impossible within any serverless timeout), while ordinary JSON API
// calls (company.json, list.json) are fast and unthrottled. The company list
// barely changes day-to-day, so it's pre-fetched locally (unthrottled) by
// scripts/refresh-corp-code-index.mjs and bundled here instead of fetched at
// request time. Re-run that script + redeploy occasionally to pick up newly
// registered companies.
const corpCodeIndex = corpCodeIndexData as CorpCodeEntry[];

// DART reports "no data" as status 013. Anything else that isn't 000 — key
// problems, the 20,000-requests/day cap (020), maintenance (800) — is a
// failure of the lookup itself and must never be read as "not on DART".
export const DART_DAILY_LIMIT_STATUS = '020';

export class DartApiError extends Error {
  readonly status: string;
  constructor(status: string, message: string) {
    super(`DART 오류 (status ${status}): ${message}`);
    this.name = 'DartApiError';
    this.status = status;
  }
}

function assertDartOk(data: { status?: string; message?: string }): void {
  if (data.status !== '000') {
    throw new DartApiError(data.status ?? 'unknown', data.message ?? '');
  }
}

// Same 60s-per-invocation reasoning as above — cap every individual DART
// request so a stuck one fails fast and the caller can move on.
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find a company's DART registration by matching name candidates, then
 * confirming the exact business registration number (bizr_no) via company.json.
 * Returns null when no candidate's bizr_no matches — i.e. the company is not
 * on DART under this identity, which callers must not paper over with a guess.
 */
export async function findDartCorp(
  name: string,
  bizNo: string,
  apiKey: string
): Promise<DartCorpMatch | null> {
  const targetBizNo = normalizeBizNo(bizNo);
  if (!targetBizNo) return null;

  const targetName = normalizeCompanyName(name);
  if (!targetName) return null;

  if (!Array.isArray(corpCodeIndex) || corpCodeIndex.length === 0) {
    throw new Error(`corp code index unavailable (got ${typeof corpCodeIndex}, length ${(corpCodeIndex as unknown[])?.length})`);
  }

  // Exact normalized-name matches are tried in full first. Partial matches
  // (e.g. a franchisee like "정왕점현대자동차" containing "현대자동차") are a much
  // weaker signal and are only tried, capped, if no exact match confirms —
  // otherwise a handful of unrelated partial hits can crowd out the real
  // company before its bizr_no is ever checked.
  const exactMatches = corpCodeIndex.filter((entry) => normalizeCompanyName(entry.corpName) === targetName).slice(0, 10);
  const partialMatches = corpCodeIndex.filter((entry) => {
    const candidateName = normalizeCompanyName(entry.corpName);
    return candidateName !== targetName && (candidateName.includes(targetName) || targetName.includes(candidateName));
  }).slice(0, 5);
  const candidates = [...exactMatches, ...partialMatches];

  // Failures are thrown, not skipped: skipping a candidate that failed to load
  // could turn a real match into a false "not on DART".
  for (const candidate of candidates) {
    const response = await fetchWithTimeout(`${DART_PROXY_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${candidate.corpCode}`, 10000);
    if (!response.ok) throw new Error(`company.json HTTP ${response.status}`);
    const data = await response.json() as Record<string, string>;
    if (data.status === '013') continue;
    assertDartOk(data);
    if (normalizeBizNo(data.bizr_no || '') === targetBizNo) {
      return {
        corpCode: candidate.corpCode,
        bizrNo: data.bizr_no,
        adres: data.adres,
        ceoNm: data.ceo_nm,
        phoneNo: data.phn_no,
      };
    }
  }

  return null;
}

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

export function extractCreditRatingFromText(rawText: string): BondRatingFound | null {
  const text = stripXmlTags(rawText);
  let searchFrom = 0;

  // Anchor directly on the "신용평가기관" (rating agency) table label rather than
  // on "신용등급" (credit rating). Filings from ~2023+ lay the summary table out
  // as separate "평가일 | 신용평가기관 | 등급" columns with no combined "신용등급"
  // wording nearby at all, while older filings use a single "신용등급(신용평가기관)"
  // label — "신용평가기관" is the one string present in both eras, and it doesn't
  // show up in the narrative risk-disclosure prose that also names agencies
  // (that prose says "한국신용평가", "NICE신용평가" etc., never "신용평가기관").
  while (true) {
    const idx = text.indexOf(TABLE_LABEL, searchFrom);
    if (idx === -1) return null;

    const windowText = text.slice(idx, idx + 150);
    const ratingMatch = RATING_TOKEN_PATTERN.exec(windowText);
    if (ratingMatch) {
      // DART's XML sometimes wraps individual characters in separate tags, so
      // stripping tags can leave stray spaces inside a name (e.g. "한 국신용평가").
      // Compare with whitespace ignored so agency names still match.
      const compactWindow = windowText.replace(/\s+/g, '');
      const agency = RATING_AGENCY_NAMES.find((a) => compactWindow.includes(a.replace(/\s+/g, ''))) || '신용평가기관';
      return { rating: normalizeRatingToken(ratingMatch[1]), agency };
    }

    searchFrom = idx + TABLE_LABEL.length;
  }
}

// Each candidate filing can mean downloading and decoding a multi-hundred-KB
// document, also throttled to ~14KB/s from cloud IPs (confirmed: a 490KB
// filing took 37s from Vercel) — capped to the most recent few so a single
// company can't require an unbounded number of these slow fetches. This is
// also more correct: a rating from a 2011 filing is stale and shouldn't be
// reported as current (the exact bug this pipeline was built to avoid).
export const MAX_BOND_FILINGS_TO_CHECK = 5;

/**
 * Lists a corp's 채무증권(사채) 증권신고서 filings, most recent first — fast
 * (list.json is small JSON, not throttled). Scope is intentionally limited to
 * this filing type (agreed with the user) — business reports' management-
 * discussion sections are not searched.
 */
export async function listBondFilings(corpCode: string, apiKey: string): Promise<BondFiling[]> {
  const listUrl = `${DART_PROXY_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&pblntf_ty=C&bgn_de=19990101&end_de=${todayYyyyMmDd()}&page_count=100`;
  const listResponse = await fetchWithTimeout(listUrl, 10000);
  if (!listResponse.ok) throw new Error(`list.json HTTP ${listResponse.status}`);
  interface DartListItem {
    report_nm: string;
    rcept_no: string;
    rcept_dt: string;
  }
  const listData = await listResponse.json() as { status: string; message?: string; list?: DartListItem[] };
  if (listData.status === '013') return [];
  assertDartOk(listData);
  if (!Array.isArray(listData.list)) return [];

  return listData.list
    .filter((item) => item.report_nm.includes('증권신고서(채무증권)'))
    .sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt))
    .slice(0, MAX_BOND_FILINGS_TO_CHECK)
    .map((item) => ({ rceptNo: item.rcept_no, reportName: item.report_nm, reportDate: item.rcept_dt }));
}

/**
 * Downloads and checks ONE filing document for a stated credit rating. This
 * is the slow, throttled step (~30-40s for a typical filing) — deliberately
 * isolated to its own function/request so a caller can run it as one unit of
 * work per (serverless-function-timeout-bounded) call instead of looping
 * through several filings within a single invocation.
 */
export async function checkFilingForRating(rceptNo: string, apiKey: string): Promise<BondRatingFound | null> {
  // Leaves ~8s of the 60s budget for unzip/decode/response after the download.
  const response = await fetchWithTimeout(`${DART_PROXY_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`, 52000);
  if (!response.ok) throw new Error(`document.xml HTTP ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());

  // On errors (e.g. the daily request cap) DART answers with a small XML
  // status document instead of a zip.
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(buffer);
  } catch {
    const body = new TextDecoder('utf-8').decode(buffer);
    const status = /<status>(\d+)<\/status>/.exec(body)?.[1] ?? 'unknown';
    const message = /<message>([^<]*)<\/message>/.exec(body)?.[1] ?? body.slice(0, 200);
    throw new DartApiError(status, message);
  }
  const bytes = files[Object.keys(files)[0]];

  // Older DART filings declare utf-8 in their header but the bytes are
  // actually EUC-KR; newer filings (~2023+) are genuinely UTF-8 as declared.
  // Detect by trying a strict UTF-8 decode first — EUC-KR byte sequences
  // almost always fail it — falling back to EUC-KR only when that throws.
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('euc-kr').decode(bytes);
  }

  return extractCreditRatingFromText(text);
}

function todayYyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
