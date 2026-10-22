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

// DART throttles downloads to ~14KB/s from overseas IPs (confirmed: a 3.6MB
// corpCode.xml took 4+ minutes from Vercel's US region). The functions now
// run in Seoul (vercel.json), where downloads are fast, but the company list
// barely changes day-to-day, so it stays pre-fetched by
// scripts/refresh-corp-code-index.mjs and bundled here instead of fetched on
// every request. Re-run that script + redeploy occasionally to pick up newly
// registered companies.
const corpCodeIndex = corpCodeIndexData as CorpCodeEntry[];

// DART reports "no data" as status 013. Anything else that isn't 000 — key
// problems, the 20,000-requests/day cap (020), maintenance (800) — is a
// failure of the lookup itself and must never be read as "not on DART".
export const DART_DAILY_LIMIT_STATUS = '020';
const NO_DOCUMENT_STATUS = '014';

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

// Cap every individual DART request (serverless functions have a time limit)
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
// document (from overseas IPs throttled to ~14KB/s — confirmed: a 490KB
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
export async function checkFilingForRating(rceptNo: string, apiKey: string, timeoutMs = 52000): Promise<BondRatingFound | null> {
  const text = await downloadFilingText(rceptNo, apiKey, timeoutMs);
  return text === null ? null : extractCreditRatingFromText(text);
}

/**
 * Downloads a filing's main document as text, or null when DART has no
 * document for it (status 014 — e.g. "[첨부정정]" filings, which only amend
 * attachments; that says nothing about the rating, so callers move on).
 */
async function downloadFilingText(rceptNo: string, apiKey: string, timeoutMs: number): Promise<string | null> {
  const response = await fetchWithTimeout(`${DART_PROXY_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`, timeoutMs);
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
    if (status === NO_DOCUMENT_STATUS) return null;
    const message = /<message>([^<]*)<\/message>/.exec(body)?.[1] ?? body.slice(0, 200);
    throw new DartApiError(status, message);
  }
  // The main document is "<rceptNo>.xml"; the rest are attachments (e.g. the
  // audit report), which don't carry the rating table.
  const bytes = files[`${rceptNo}.xml`] ?? files[Object.keys(files)[0]];

  // Older DART filings declare utf-8 in their header but the bytes are
  // actually EUC-KR; newer filings (~2023+) are genuinely UTF-8 as declared.
  // Detect by trying a strict UTF-8 decode first — EUC-KR byte sequences
  // almost always fail it — falling back to EUC-KR only when that throws.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// Annual business report (사업보고서) ratings — the primary source.
//
// A bond filing only states the rating at the time bonds were issued, so a
// company that hasn't issued in years shows a years-old rating. The annual
// report's credit-rating table also lists the yearly surveillance ratings
// (정기평가), with the date and agency of each — so it's both fresher and
// explicit about when the rating is from.
// ---------------------------------------------------------------------------

export interface AnnualReport {
  rceptNo: string;
  reportName: string;
  reportDate: string;
}

export interface AnnualReportRating {
  rating: CreditRating;
  agency: string;
  evaluatedAt: string; // YYYY-MM-DD
  evaluationType: string; // 본평가 / 정기평가 / 수시평가, or '' when not stated
}

/** The most recent 사업보고서 filed in the last 3 years, or null if none. */
export async function findLatestAnnualReport(corpCode: string, apiKey: string): Promise<AnnualReport | null> {
  const today = todayYyyyMmDd();
  const threeYearsAgo = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  const url = `${DART_PROXY_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&pblntf_ty=A&pblntf_detail_ty=A001&bgn_de=${threeYearsAgo}&end_de=${today}&page_count=20`;
  const response = await fetchWithTimeout(url, 10000);
  if (!response.ok) throw new Error(`list.json HTTP ${response.status}`);
  const data = await response.json() as { status: string; message?: string; list?: { report_nm: string; rcept_no: string; rcept_dt: string }[] };
  if (data.status === '013') return null;
  assertDartOk(data);

  const report = (data.list ?? [])
    .filter((item) => item.report_nm.includes('사업보고서') && !item.report_nm.includes('첨부'))
    .sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt))[0];
  return report ? { rceptNo: report.rcept_no, reportName: report.report_nm, reportDate: report.rcept_dt } : null;
}

// "2025.06.30", "2025-06-30", "2025년 06월 30일", or "'25.06.30".
const DATE_PATTERN = /(?:(\d{4})|['’](\d{2}))\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*일?/g;
// Short-term instruments use a separate A1~D scale that can't be compared
// against the B- cutoff, so their rows are ignored.
const SHORT_TERM_PATTERN = /기업어음|단기사채|전자단기|CP|ABSTB/;
// Only Korean agencies' ratings count: the same table often lists global
// ratings (S&P/Moody's/Fitch), which are on a different, stricter scale.
const DOMESTIC_AGENCY_NAMES = ['한국신용평가', 'NICE신용평가', '나이스신용평가', '한국기업평가', '서울신용평가', '한신평', '한기평'];
// A business report also describes consolidated subsidiaries — as separate
// sections ("□ 자회사명") or as a table right after the company's own
// ("종속회사인 ○○㈜의 … 신용평가 내역"). Stop before those so a subsidiary's
// rating is never read as the company's.
const SUBSIDIARY_SECTION_MARKERS = ['□', '종속회사', '회사의 연혁'];
// Short-term grades (A1, A2+, A3-) — these rows must not inherit a
// long-term rating from the row above.
const SHORT_TERM_GRADE_PATTERN = /(?<![A-Za-z0-9])A[123][+-]?(?![0-9])/;
const EVALUATION_TYPE_PATTERN = /본평가|정기평가|수시평가|예비평가/;
// Scale notes like "(AAA ~ D, 10등급)" contain rating-looking tokens.
const SCALE_NOTE_PATTERN = /\(\s*(?:AAA|A1)\s*~\s*D[^)]*\)/g;
const MAX_ROW_LENGTH = 300;

/**
 * Reads the annual report's credit-rating table (평가일 | 평가대상 | 등급 |
 * 평가회사 | 평가구분) and returns its most recent long-term rating.
 */
export function extractRatingFromAnnualReport(rawText: string): AnnualReportRating | null {
  const text = stripXmlTags(rawText).replace(SCALE_NOTE_PATTERN, ' ');
  const rows: AnnualReportRating[] = [];

  // A table header: "평가일" followed closely by an agency column label.
  const headerPattern = /평가\s*일[^가-힣]{0,5}[\s\S]{0,200}?(평가\s*회사|신용평가\s*기관|평가\s*기관)/g;
  const headers = [...text.matchAll(headerPattern)];
  if (headers.length === 0) return null;

  // The company's own tables run from the first header up to the first
  // subsidiary section (several tables may sit there, e.g. bonds and CP apart).
  const firstHeaderEnd = (headers[0].index ?? 0) + headers[0][0].length;
  const ownSectionEnd = Math.min(
    ...SUBSIDIARY_SECTION_MARKERS.map((m) => text.indexOf(m, firstHeaderEnd)).filter((i) => i >= 0),
    firstHeaderEnd + 30000
  );

  for (const header of headers) {
    const start = (header.index ?? 0) + header[0].length;
    if (start > ownSectionEnd) break;
    const dates = [...text.slice(start, ownSectionEnd).matchAll(DATE_PATTERN)];
    let previousEnd = 0;
    // Tables often merge the rating cell across rows (one rating, several
    // agencies/dates); such a row has no rating of its own and takes the
    // one above it.
    let ratingAbove: CreditRating | null = null;
    let typeAbove = '';
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dateStart = date.index ?? 0;
      // Rows sit back to back; a long gap means the table has ended.
      if (dateStart - previousEnd > MAX_ROW_LENGTH) break;
      const rowEnd = Math.min(dates[i + 1]?.index ?? dateStart + MAX_ROW_LENGTH, dateStart + MAX_ROW_LENGTH);
      const row = text.slice(start + dateStart + date[0].length, start + rowEnd);
      previousEnd = rowEnd;

      // The agency column follows the rating column, so the rating is read
      // only from the text before the agency name — never from whatever
      // comes after the table (e.g. the rating-scale explanation).
      const agencyHit = DOMESTIC_AGENCY_NAMES
        .map((name) => ({ name, at: row.indexOf(name) }))
        .filter((hit) => hit.at >= 0)
        .sort((a, b) => a.at - b.at)[0];
      if (!agencyHit) {
        ratingAbove = null; // e.g. an S&P/Moody's row
        typeAbove = '';
        continue;
      }
      const beforeAgency = row.slice(0, agencyHit.at);
      if (SHORT_TERM_PATTERN.test(beforeAgency) || SHORT_TERM_GRADE_PATTERN.test(beforeAgency)) {
        ratingAbove = null;
        typeAbove = '';
        continue;
      }
      const ratingMatch = RATING_TOKEN_PATTERN.exec(beforeAgency);
      const rating: CreditRating | null = ratingMatch ? normalizeRatingToken(ratingMatch[1]) : ratingAbove;
      if (!rating) continue;
      ratingAbove = rating;
      // 평가구분 is the column right after the agency (also often merged).
      const afterAgency = row.slice(agencyHit.at + agencyHit.name.length, agencyHit.at + agencyHit.name.length + 20);
      const evaluationType = EVALUATION_TYPE_PATTERN.exec(afterAgency)?.[0] ?? typeAbove;
      typeAbove = evaluationType;

      const agency = agencyHit.name;
      const year = date[1] ?? `20${date[2]}`;
      rows.push({
        rating,
        agency: agency === '나이스신용평가' ? 'NICE신용평가' : agency === '한신평' ? '한국신용평가' : agency === '한기평' ? '한국기업평가' : agency,
        evaluatedAt: `${year}-${date[3].padStart(2, '0')}-${date[4].padStart(2, '0')}`,
        evaluationType
      });
    }
  }

  // Most recent first; on the same date, the lower (more conservative) rating.
  rows.sort((a, b) =>
    b.evaluatedAt.localeCompare(a.evaluatedAt) ||
    CREDIT_RATINGS_ORDER.indexOf(b.rating) - CREDIT_RATINGS_ORDER.indexOf(a.rating)
  );
  return rows[0] ?? null;
}

/**
 * Finds the latest annual report and reads its rating table. Annual reports
 * are large; if DART throttles the download it can exceed `timeoutMs`, which throws
 * an AbortError — callers then fall back to bond filings.
 */
export async function checkAnnualReportRating(
  corpCode: string,
  apiKey: string,
  timeoutMs = 52000
): Promise<(AnnualReportRating & { report: AnnualReport }) | null> {
  const report = await findLatestAnnualReport(corpCode, apiKey);
  if (!report) return null;
  const text = await downloadFilingText(report.rceptNo, apiKey, timeoutMs);
  const found = text === null ? null : extractRatingFromAnnualReport(text);
  return found ? { ...found, report } : null;
}

function todayYyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
