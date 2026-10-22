import * as XLSX from 'xlsx';
import type { CompanyRawData, CompanyAnalysisResult } from '../types';
import { describeRatingSource, formatRating, ratingBasisDate } from './ratingSource';

/**
 * Parse an Excel, CSV, or JSON File into raw company objects
 */
export async function parseCompanyFile(file: File): Promise<CompanyRawData[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    return normalizeRawDataList(Array.isArray(data) ? data : [data]);
  }

  // Handle Excel / CSV
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

  return normalizeRawDataList(jsonRows);
}

// Exported for scripts/bulk-upload.ts, which reads the sheet itself in Node.
export function normalizeRawDataList(rows: Record<string, any>[]): CompanyRawData[] {
  return rows.map((row, index) => {
    const nameKey = findHeaderKey(row, ['회사명', '기업명', '상호명', '업체명', 'company', 'name']);
    const addressKey = findHeaderKey(row, ['주소', '소재지', '본사주소', '공장주소', 'address', 'location']);
    const bizNoKey = findHeaderKey(row, ['사업자번호', '사업자등록번호', 'bizNo', 'biz_no', 'businessNumber']);
    const corpCodeKey = findHeaderKey(row, ['DART코드', '법인코드', '고유번호', 'corpCode', 'corp_code']);
    const phoneKey = findHeaderKey(row, ['전화번호', '연락처', '대표전화', 'phone', 'tel']);
    const industryKey = findHeaderKey(row, ['업종', '주요품목', '산업', 'industry']);
    const notesKey = findHeaderKey(row, ['비고', '메모', 'notes', 'remark']);

    const name = nameKey ? String(row[nameKey]).trim() : `업체_${index + 1}`;
    const address = addressKey ? String(row[addressKey]).trim() : '서울특별시 강남구 테헤란로 100';

    return {
      id: `custom-${Date.now()}-${index}`,
      name,
      address,
      bizNo: bizNoKey ? String(row[bizNoKey]).trim() : undefined,
      corpCode: corpCodeKey ? String(row[corpCodeKey]).trim() : undefined,
      phone: phoneKey ? String(row[phoneKey]).trim() : undefined,
      industry: industryKey ? String(row[industryKey]).trim() : undefined,
      notes: notesKey ? String(row[notesKey]).trim() : undefined
    };
  });
}

function findHeaderKey(row: Record<string, any>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find((k) => k.toLowerCase().replace(/\s/g, '') === candidate.toLowerCase());
    if (found) return found;
  }
  return undefined;
}

export function exportResultsToExcel(results: CompanyAnalysisResult[], filename: string = '한솔로지스틱스_거점별_선정기업_리스트.xlsx') {
  const exportData = results.map((r, idx) => ({
    '연번': idx + 1,
    '선정상태': r.ratingStatus === 'PASS' ? '합격 (B등급 이상)' : '불합격',
    '기업명': r.company.name,
    'DART 신용등급': formatRating(r),
    '부채비율(%)': r.debtRatio ? `${r.debtRatio}%` : '-',
    '영업이익률(%)': r.operatingMargin ? `${r.operatingMargin}%` : '-',
    '최단 한솔 거점': r.nearestHub.name,
    '거점 구분': r.nearestHub.type,
    '직선거리(km)': `${r.distanceKm} km`,
    '예상 주행시간': `약 ${Math.round(r.distanceKm * 1.25 / 55 * 60)}분`,
    '주소': r.company.address,
    '사업자번호': r.company.bizNo || '-',
    '대표전화': r.company.phone || '-',
    '업종': r.company.industry || '-',
    '공시출처':
      r.dartSource === 'LIVE_DART' ? `DART ${describeRatingSource(r.ratingSource)}` :
      r.dartSource === 'NOT_ON_DART' ? 'DART 미등록' :
      'DART 등록 · 등급 미확인',
    '등급 기준일': ratingBasisDate(r.ratingSource) || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 45 },
    { wch: 16 },
    { wch: 16 },
    { wch: 25 },
    { wch: 16 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '선정 기업 및 거점 정렬');
  XLSX.writeFile(workbook, filename);
}

export function downloadSampleTemplate() {
  const sampleRows = [
    {
      '기업명': '삼성전자 (주)',
      '사업자등록번호': '124-81-00998',
      '주소': '경기도 수원시 영통구 삼성로 129',
      '대표전화': '031-200-1114',
      '업종': '전자부품, 반도체'
    },
    {
      '기업명': '현대자동차 (주)',
      '사업자등록번호': '101-81-09147',
      '주소': '충청남도 아산시 인주면 현대로 1070',
      '대표전화': '041-530-5114',
      '업종': '자동차 제조업'
    },
    {
      '기업명': 'LG화학 (주)',
      '사업자등록번호': '107-86-14075',
      '주소': '충청북도 청주시 흥덕구 산단로 18',
      '대표전화': '043-261-3114',
      '업종': '석유화학, 첨단소재'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 40 },
    { wch: 15 },
    { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'RawData_양식');
  XLSX.writeFile(workbook, '기업_RawData_샘플양식.xlsx');
}
