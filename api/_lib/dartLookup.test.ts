import { describe, it, expect } from 'vitest';
import { extractCreditRatingFromText, extractRatingFromAnnualReport } from './dartLookup';

// Fixtures below are trimmed snippets from a real DART 증권신고서(채무증권)
// filing (Hyundai Motor, rcept_no 20210128000530), captured via document.xml
// and decoded from EUC-KR during manual testing.

const SUMMARY_TABLE_SNIPPET = `
<TU>지급대행기관</TU><TU>㈜하나은행</TU>
<TU>(사채)관리회사</TU><TU>한국증권금융(주)</TU>
<TU>신용등급</TU><TU>(신용평가기관)</TU><TU>AA+ / AA+</TU>
<TU>( 한국신용평가 / 나이스신용평가)</TU>
<TU>인수인</TU><TU>증권의 종류</TU><TU>인수수량</TU><TU>인수금액</TU>
`;

// Narrative risk-disclosure text mentioning a historical rating change. This
// should NOT be mistaken for the current rating — it names agencies but never
// uses the "(신용평가기관)" summary-table label.
const DOWNGRADE_NARRATIVE_SNIPPET = `
[아. 신용등급 하락에 따른 위험]
당사의 신용등급은 2019년 11월, 한국신용평가, NICE신용평가, 한국기업평가로부터
AAA(부정적)에서 하향 조정된 AA+(안정적) 신용등급을 부여받았습니다.
`;

const NO_RATING_MENTION_SNIPPET = `
당사는 컨테이너 운송 및 물류 서비스를 주력 사업으로 영위하고 있습니다.
`;

// Trimmed from a real 2025 증권신고서(채무증권) filing (Hyundai Elevator,
// rcept_no 20250211000756). Newer filings lay the summary table out as
// separate "평가일 | 신용평가기관 | 등급" columns — there is no combined
// "신용등급(신용평가기관)" label like the older format, so "신용등급" never
// appears near this table at all. They also use Korean agencies' "X0" notation
// (e.g. "A0") for the middle sub-grade instead of the plain letter.
const NEW_FORMAT_TABLE_SNIPPET = `
<TU>비고</TU><TU>-</TU>
<TU>평가일</TU><TU>신용평가기관</TU><TU>등 급</TU>
<TU>2025년 02월 07일</TU><TU>한국기업평가</TU><TU>회사채 (A+)</TU>
<TU>2025년 02월 10일</TU><TU>나이스신용평가</TU><TU>회사채 (A0)</TU>
`;

describe('extractCreditRatingFromText', () => {
  it('extracts the rating from the 신용등급(신용평가기관) summary table', () => {
    const result = extractCreditRatingFromText(SUMMARY_TABLE_SNIPPET);
    expect(result).not.toBeNull();
    expect(result?.rating).toBe('AA+');
  });

  it('does not extract a rating from narrative text that only names agencies', () => {
    const result = extractCreditRatingFromText(DOWNGRADE_NARRATIVE_SNIPPET);
    expect(result).toBeNull();
  });

  it('returns null when the text has no rating information at all', () => {
    const result = extractCreditRatingFromText(NO_RATING_MENTION_SNIPPET);
    expect(result).toBeNull();
  });

  it('skips an unreliable mention and finds the reliable table further down', () => {
    // A large gap mirrors the real filing, where the risk-disclosure narrative
    // and the summary table sit in entirely different sections.
    const filler = '당사는 물류 및 운송 서비스를 영위하는 법인입니다. '.repeat(20);
    const combined = DOWNGRADE_NARRATIVE_SNIPPET + filler + SUMMARY_TABLE_SNIPPET;
    const result = extractCreditRatingFromText(combined);
    expect(result?.rating).toBe('AA+');
  });

  it('extracts from the newer 평가일/신용평가기관/등급 column layout with no "신용등급" nearby', () => {
    const result = extractCreditRatingFromText(NEW_FORMAT_TABLE_SNIPPET);
    expect(result?.rating).toBe('A+');
  });

  it('normalizes the Korean "X0" mid-grade notation to the plain-letter rating', () => {
    const soloA0 = `<TU>신용평가기관</TU><TU>등급</TU><TU>나이스신용평가</TU><TU>회사채 (A0)</TU>`;
    expect(extractCreditRatingFromText(soloA0)?.rating).toBe('A');

    const soloBBB0 = `<TU>신용평가기관</TU><TU>등급</TU><TU>한국기업평가</TU><TU>회사채 (BBB0)</TU>`;
    expect(extractCreditRatingFromText(soloBBB0)?.rating).toBe('BBB');
  });
});

// Trimmed from real 사업보고서 (2025.12) credit-rating tables.
const HYUNDAI_MOTOR_ANNUAL = `
<TU>평가일</TU><TU>평가대상유가증권 등</TU><TU>신용등급</TU><TU>평가회사</TU><TU>평가구분</TU>
<TU>2025-01-22</TU><TU>기업신용등급(ICR)</TU><TU>A-(Stable)</TU><TU>S&amp;P(미국)</TU><TU>수시평가</TU>
<TU>2025-11-03</TU><TU>A-(Stable)</TU><TU>Fitch(미국)</TU><TU>수시평가</TU>
<TU>2024-04-01</TU><TU>회사채</TU><TU>AAA(안정적)</TU><TU>NICE신용평가</TU><TU>정기평가</TU>
<TU>2024-04-19</TU><TU>AA+(긍정적)</TU><TU>한국기업평가</TU><TU>정기평가</TU>
<TU>2024-10-31</TU><TU>AAA(안정적)</TU><TU>한국기업평가</TU><TU>수시평가</TU>
`;

const HYUNDAI_ELEVATOR_ANNUAL = `
<TU>평가일</TU><TU>평가대상</TU><TU>등급</TU><TU>평가회사</TU><TU>평가 구분</TU>
<TU>2025.06.30</TU><TU>회사채</TU><TU>A0</TU><TU>NICE신용평가(AAA~D)</TU><TU>정기평가</TU>
<TU>2025.06.23</TU><TU>회사채</TU><TU>A+</TU><TU>한국기업평가(AAA~D)</TU><TU>정기평가</TU>
`;

// Only CP (short-term A1 scale), followed by a subsidiary's section that
// must not be read as the company's own.
const OTTOGI_ANNUAL = `
<TU>평가일</TU><TU>평가대상유가증권</TU><TU>신용등급</TU><TU>평가회사(신용평가 등급범위)</TU><TU>비고</TU>
<TU>'25.11.12</TU><TU>기업어음</TU><TU>A1</TU><TU>한국기업평가(A1 ~ D)</TU><TU>정기평가</TU>
<TU>'25.11.12</TU><TU>기업어음</TU><TU>A1</TU><TU>NICE신용평가(A1 ~ D)</TU><TU>정기평가</TU>
<P>□ 오뚜기냉동식품(주)</P>
<TU>평가일</TU><TU>평가대상</TU><TU>신용등급</TU><TU>평가회사</TU>
<TU>2025.05.01</TU><TU>회사채</TU><TU>BBB</TU><TU>한국기업평가</TU>
`;

describe('extractRatingFromAnnualReport', () => {
  it('ignores global ratings and takes the latest domestic one', () => {
    expect(extractRatingFromAnnualReport(HYUNDAI_MOTOR_ANNUAL)).toEqual({
      rating: 'AAA', agency: '한국기업평가', evaluatedAt: '2024-10-31', evaluationType: '수시평가'
    });
  });

  it('reads the "X0" notation and does not mistake the "(AAA~D)" scale note for a rating', () => {
    expect(extractRatingFromAnnualReport(HYUNDAI_ELEVATOR_ANNUAL)).toEqual({
      rating: 'A', agency: 'NICE신용평가', evaluatedAt: '2025-06-30', evaluationType: '정기평가'
    });
  });

  it('returns null for CP-only tables and never reads a subsidiary section', () => {
    expect(extractRatingFromAnnualReport(OTTOGI_ANNUAL)).toBeNull();
  });

  it('returns null when there is no rating table', () => {
    expect(extractRatingFromAnnualReport(NO_RATING_MENTION_SNIPPET)).toBeNull();
  });
});
