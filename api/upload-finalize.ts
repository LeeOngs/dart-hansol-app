import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CompanyAnalysisResult } from '../src/types.js';
import { saveUpload } from './_lib/companyStore.js';
import { isValidAdminPassword } from './_lib/adminAuth.js';
import { isValidDatasetYear } from '../src/services/companyStore.js';

// Keeps the request body well under Vercel's 4.5MB limit. Larger loads
// (scripts/bulk-upload.ts) are sent in chunks using `appendToId`.
const MAX_RESULTS_PER_REQUEST = 1000;

// Adds the results of an analysis the admin's browser already ran step by
// step (via api/dart/*) to the shared company list, and logs the upload.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, year, label, results, skippedCount, failedCount, appendToId } = req.body ?? {};
  if (!isValidAdminPassword(adminPassword)) {
    res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    return;
  }
  if (!isValidDatasetYear(year)) {
    res.status(400).json({ error: '자료 연도(예: 2026)가 필요합니다.' });
    return;
  }
  if (!Array.isArray(results)) {
    res.status(400).json({ error: '저장할 분석 결과가 없습니다.' });
    return;
  }
  if (results.length > MAX_RESULTS_PER_REQUEST) {
    res.status(400).json({ error: `한 번에 최대 ${MAX_RESULTS_PER_REQUEST}개 기업까지만 저장할 수 있습니다.` });
    return;
  }

  try {
    const saved = await saveUpload({
      year,
      label: typeof label === 'string' ? label : undefined,
      results: results as CompanyAnalysisResult[],
      skippedCount: Number(skippedCount) || 0,
      failedCount: Number(failedCount) || 0,
      appendToId: typeof appendToId === 'string' ? appendToId : undefined
    });
    res.status(200).json(saved);
  } catch (err) {
    console.error('upload-finalize failed:', err);
    res.status(500).json({ error: `저장 실패: ${(err as Error).message}` });
  }
}
