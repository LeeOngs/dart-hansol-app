import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from '../_lib/adminAuth.js';
import { listBondFilings } from '../_lib/dartLookup.js';

// Fast — list.json is small, unthrottled JSON.
export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, corpCode } = req.body ?? {};
  if (!isValidAdminPassword(adminPassword)) {
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
    const filings = await listBondFilings(corpCode, apiKey);
    res.status(200).json({ filings });
  } catch (err) {
    console.error('list-bond-filings failed:', err);
    res.status(500).json({ error: `공시 목록 조회 실패: ${(err as Error).message}` });
  }
}
