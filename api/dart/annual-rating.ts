import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from '../_lib/adminAuth.js';
import { checkAnnualReportRating } from '../_lib/dartLookup.js';

// Latest 사업보고서 + its rating table in one call. Annual reports are large
// and DART throttles downloads from overseas IPs, so this can run long; on
// timeout it answers "skipped" and the client falls back to bond filings.
export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, corpCode } = req.body ?? {};
  if (!(await isValidAdminPassword(adminPassword))) {
    res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    return;
  }
  if (typeof corpCode !== 'string') {
    res.status(400).json({ error: 'corpCode가 필요합니다.' });
    return;
  }

  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 DART_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  try {
    // Leaves room under maxDuration for the list call and parsing.
    const found = await checkAnnualReportRating(corpCode, apiKey, 280000);
    res.status(200).json({ found });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error(`annual-rating ${corpCode} timed out downloading; falling back`);
      res.status(200).json({ found: null, skipped: 'timeout' });
      return;
    }
    console.error('annual-rating failed:', err);
    res.status(500).json({ error: `사업보고서 확인 실패: ${(err as Error).message}` });
  }
}
