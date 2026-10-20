import { unzipSync } from 'fflate';
import type { CreditRating } from '../types';
import { CREDIT_RATINGS_ORDER } from '../utils/ratingLogic';
import { normalizeBizNo } from '../utils/bizNo';

const DART_PROXY_BASE = '/api/dart';

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

interface BondCreditRatingResult {
  rating: CreditRating;
  agency: string;
  rceptNo: string;
  reportName: string;
  reportDate: string;
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

let corpCodeIndexPromise: Promise<CorpCodeEntry[]> | null = null;

async function fetchAndUnzip(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DART request failed: ${response.status} ${url}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const files = unzipSync(buffer);
  const firstFileName = Object.keys(files)[0];
  return files[firstFileName];
}

export async function loadCorpCodeIndex(apiKey: string): Promise<CorpCodeEntry[]> {
  if (!corpCodeIndexPromise) {
    corpCodeIndexPromise = (async () => {
      const bytes = await fetchAndUnzip(`${DART_PROXY_BASE}/corpCode.xml?crtfc_key=${apiKey}`);
      const xml = new TextDecoder('utf-8').decode(bytes);
      const entries: CorpCodeEntry[] = [];
      const listPattern = /<corp_code>([^<]*)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>[^<]*<\/corp_eng_name>\s*<stock_code>([^<]*)<\/stock_code>/g;
      let match: RegExpExecArray | null;
      while ((match = listPattern.exec(xml)) !== null) {
        entries.push({
          corpCode: match[1].trim(),
          corpName: match[2].trim(),
          stockCode: match[3].trim(),
        });
      }
      return entries;
    })().catch((err) => {
      corpCodeIndexPromise = null;
      throw err;
    });
  }
  return corpCodeIndexPromise;
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

  const index = await loadCorpCodeIndex(apiKey);

  // Exact normalized-name matches are tried in full first. Partial matches
  // (e.g. a franchisee like "정왕점현대자동차" containing "현대자동차") are a much
  // weaker signal and are only tried, capped, if no exact match confirms —
  // otherwise a handful of unrelated partial hits can crowd out the real
  // company before its bizr_no is ever checked.
  const exactMatches = index.filter((entry) => normalizeCompanyName(entry.corpName) === targetName);
  const partialMatches = index.filter((entry) => {
    const candidateName = normalizeCompanyName(entry.corpName);
    return candidateName !== targetName && (candidateName.includes(targetName) || targetName.includes(candidateName));
  }).slice(0, 5);
  const candidates = [...exactMatches, ...partialMatches];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${DART_PROXY_BASE}/company.json?crtfc_key=${apiKey}&corp_code=${candidate.corpCode}`);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.status !== '000') continue;
      if (normalizeBizNo(data.bizr_no || '') === targetBizNo) {
        return {
          corpCode: candidate.corpCode,
          bizrNo: data.bizr_no,
          adres: data.adres,
          ceoNm: data.ceo_nm,
          phoneNo: data.phn_no,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

export function extractCreditRatingFromText(rawText: string): { rating: CreditRating; agency: string } | null {
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

async function fetchDocumentText(rceptNo: string, apiKey: string): Promise<string> {
  const bytes = await fetchAndUnzip(`${DART_PROXY_BASE}/document.xml?crtfc_key=${apiKey}&rcept_no=${rceptNo}`);
  // Older DART filings declare utf-8 in their header but the bytes are actually
  // EUC-KR; newer filings (~2023+) are genuinely UTF-8 as declared. Detect by
  // trying a strict UTF-8 decode first — EUC-KR byte sequences almost always
  // fail it — and falling back to EUC-KR only when that throws.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

/**
 * Search a corp's 채무증권(사채) 증권신고서 filings for a stated credit rating.
 * Scope is intentionally limited to this filing type (agreed with the user) —
 * business reports' management-discussion sections are not searched.
 */
export async function findBondCreditRating(corpCode: string, apiKey: string): Promise<BondCreditRatingResult | null> {
  const listUrl = `${DART_PROXY_BASE}/list.json?crtfc_key=${apiKey}&corp_code=${corpCode}&pblntf_ty=C&bgn_de=19990101&end_de=${todayYyyyMmDd()}&page_count=100`;
  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) return null;
  const listData = await listResponse.json();
  if (listData.status !== '000' || !Array.isArray(listData.list)) return null;

  const bondReports = listData.list
    .filter((item: { report_nm: string }) => item.report_nm.includes('증권신고서(채무증권)'))
    .sort((a: { rcept_dt: string }, b: { rcept_dt: string }) => b.rcept_dt.localeCompare(a.rcept_dt));

  for (const report of bondReports) {
    try {
      const text = await fetchDocumentText(report.rcept_no, apiKey);
      const found = extractCreditRatingFromText(text);
      if (found) {
        return {
          rating: found.rating,
          agency: found.agency,
          rceptNo: report.rcept_no,
          reportName: report.report_nm,
          reportDate: report.rcept_dt,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function todayYyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
